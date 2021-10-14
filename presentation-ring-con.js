(async () => {
  const defineSendReportAsyncFunction = ({ subcommand, expectedReport, timeoutErrorMessage = 'timeout.' }) => {
    return device => new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        device.removeEventListener('inputreport', checkInputReport);
        reject(new Error(timeoutErrorMessage));
      }, 5000);

      const checkInputReport = event => {
        if (event.reportId !== 0x21) {
          return;
        }

        const data = new Uint8Array(event.data.buffer);
        for (const [key, value] of Object.entries(expectedReport)) {
          if (data[key - 1] !== value) {
            return;
          }
        }

        device.removeEventListener('inputreport', checkInputReport);
        clearTimeout(timeoutId);
        setTimeout(resolve, 50);
      };

      device.addEventListener('inputreport', checkInputReport);
      device.sendReport(0x01, new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, ...subcommand]));
    });
  };

  const set_input_report_mode_to_0x30 = defineSendReportAsyncFunction({
    subcommand: [0x03, 0x30],
    expectedReport: { 14: 0x03 },
  });
  const enabling_MCU_data_22_1 = defineSendReportAsyncFunction({
    subcommand: [0x22, 0x01],
    expectedReport: { 13: 0x80, 14: 0x22 },
  });
  const enabling_MCU_data_21_21_1_1 = defineSendReportAsyncFunction({
    subcommand: [0x21, 0x21, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF3],
    expectedReport: { 14: 0x21 },
  });
  const get_ext_data_59 = defineSendReportAsyncFunction({
    subcommand: [0x59],
    expectedReport: { 14: 0x59, 16: 0x20 },
    timeoutErrorMessage: 'ring-con not found.',
  });
  const get_ext_dev_in_format_config_5C = defineSendReportAsyncFunction({
    subcommand: [0x5C, 0x06, 0x03, 0x25, 0x06, 0x00, 0x00, 0x00, 0x00, 0x1C, 0x16, 0xED, 0x34, 0x36, 0x00, 0x00, 0x00, 0x0A, 0x64, 0x0B, 0xE6, 0xA9, 0x22, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x90, 0xA8, 0xE1, 0x34, 0x36],
    expectedReport: { 14: 0x5C },
  });
  const start_external_polling_5A = defineSendReportAsyncFunction({
    subcommand: [0x5A, 0x04, 0x01, 0x01, 0x02],
    expectedReport: { 14: 0x5A },
  });
  const blinkLed = defineSendReportAsyncFunction({
    subcommand: [0x30, 0x90],
    expectedReport: { 14: 0x30 },
  });

  const extractStrainValueFromBuffer = buffer => {
    return new DataView(buffer, 38, 2).getInt16(0, true);
  };

  const getStrainValue = device => new Promise(resolve => {
    const checkInputReport = event => {
      if (event.reportId === 0x30) {
        const strainValue = extractStrainValueFromBuffer(event.data.buffer);
        if (strainValue !== 0x0000) {
          device.removeEventListener('inputreport', checkInputReport);
          resolve(strainValue);
        }
      }
    }

    device.addEventListener('inputreport', checkInputReport);
  });

  const [device] = await navigator.hid.requestDevice({
    filters: [{
      vendorId: 0x057e, // Nintendo vendor ID
      productId: 0x2007, // joy-con R
    }],
  });
  if (!device) {
    throw new Error('device not found.');
  }

  if (!device.opened) {
    await device.open();
  }

  await set_input_report_mode_to_0x30(device);
  await enabling_MCU_data_22_1(device);
  await enabling_MCU_data_21_21_1_1(device);
  await get_ext_data_59(device);
  await get_ext_dev_in_format_config_5C(device);
  await start_external_polling_5A(device);

  const NEUTRAL_STRAIN_VALUE = await getStrainValue(device);
  const NEUTRAL_STRAIN_RADIUS = 0x0400;
  const NEUTRAL_STRAIN_RADIUS_MARGIN = 0x0010;
  const LEFT_ARROW_KEY = 'ArrowLeft';
  const LEFT_ARROW_KEY_CODE = 37;
  const RIGHT_ARROW_KEY = 'ArrowRight';
  const RIGHT_ARROW_KEY_CODE = 39;

  console.log('Ready!');
  console.log('NEUTRAL_STRAIN_VALUE:', NEUTRAL_STRAIN_VALUE);
  await blinkLed(device);

  const pressKey = (key, keyCode) => {
    const activeElement = document.activeElement;
    const targetDocument = activeElement.tagName === 'IFRAME' ? activeElement.contentDocument : document;
    ['keydown', 'keyup'].forEach(typeArg => {
      targetDocument.body.dispatchEvent(new KeyboardEvent(typeArg, { key, keyCode, bubbles: true }));
    });
  };

  let isPressing = false;

  device.addEventListener('inputreport', event => {
    if (event.reportId === 0x30) {
      isPressing = (strainValue => {
        if (isPressing) {
          if (NEUTRAL_STRAIN_VALUE - NEUTRAL_STRAIN_RADIUS + NEUTRAL_STRAIN_RADIUS_MARGIN <=
            strainValue && strainValue <= NEUTRAL_STRAIN_VALUE + NEUTRAL_STRAIN_RADIUS -
            NEUTRAL_STRAIN_RADIUS_MARGIN) {
            return false;
          }
          return true;
        }

        if (strainValue < NEUTRAL_STRAIN_VALUE - NEUTRAL_STRAIN_RADIUS) {
          pressKey(LEFT_ARROW_KEY, LEFT_ARROW_KEY_CODE);
          return true;
        } else if (NEUTRAL_STRAIN_VALUE + NEUTRAL_STRAIN_RADIUS < strainValue) {
          pressKey(RIGHT_ARROW_KEY, RIGHT_ARROW_KEY_CODE);
          return true;
        }
        return false;
      })(extractStrainValueFromBuffer(event.data.buffer));
    }
  });
})();
