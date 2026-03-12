const triggerButton = document.getElementById('sunbit-trigger');

const parseConfig = () => {
  const hash = window.location.hash.substring(1);
  if (!hash) return null;

  try {
    return JSON.parse(decodeURIComponent(atob(hash)));
  } catch {
    return null;
  }
};

const config = parseConfig();
const extensionId = config?.extensionId;

const sendMessageToExtension = (messageType, payload = null) =>
  new Promise((resolve) => {
    if (!extensionId || !chrome?.runtime?.sendMessage) {
      resolve(null);
      return;
    }

    chrome.runtime.sendMessage(
      extensionId,
      { type: messageType, payload },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      }
    );
  });

const REQUIRED_CONFIG_FIELDS = ['token', 'referenceId', 'orderId', 'totalAmount', 'sunbitKey', 'mode'];

const getMissingFields = () =>
  REQUIRED_CONFIG_FIELDS.filter((field) => !config?.[field]);

const missingFields = config ? getMissingFields() : REQUIRED_CONFIG_FIELDS;

if (missingFields.length > 0) {
  sendMessageToExtension('SUNBIT_ERROR', {
    message: `Missing required config fields: ${missingFields.join(', ')}`,
  });
} else {
  const { sunbitKey, mode, token, referenceId, orderId, totalAmount, customerDetails } = config;

  window.sunbitAsyncInit = () => {
    sendMessageToExtension('SUNBIT_SDK_LOADED');

    SUNBIT.init({
      sunbitKey,
      enablePaymentPath: true,
      mode,
    });

    SUNBIT.PaymentPathModule.then((paymentPathModule) => {
      const { init, bindButton } = paymentPathModule;

      init(undefined, {
        token,
        referenceId,
        orderId,
        totalAmount,
        customerDetails,
        onLoaded: () => {
          bindButton('#sunbit-trigger');
          sendMessageToExtension('SUNBIT_WIDGET_LOADED');
          triggerButton.click();
        },
        onLinkSent: () => {
          sendMessageToExtension('SUNBIT_LINK_SENT');
        },
        onTokenExpired: async () => {
          const tokenResponse = await sendMessageToExtension('SUNBIT_TOKEN_EXPIRED');

          if (!tokenResponse?.success) {
            sendMessageToExtension('SUNBIT_ERROR', { message: 'Token refresh failed' });
            return;
          }

          paymentPathModule.setToken(tokenResponse.token);
        },
      });
    }).catch((error) => {
      sendMessageToExtension('SUNBIT_ERROR', { message: error.message });
    });
  };
}
