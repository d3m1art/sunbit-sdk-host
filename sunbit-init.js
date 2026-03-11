(() => {
  const SDK_LOAD_TIMEOUT_MS = 5000;

  const statusWrapper = document.getElementById('status-wrapper');
  const statusMessage = document.getElementById('status-message');
  const retryButton = document.getElementById('retry-button');
  const triggerButton = document.getElementById('sunbit-trigger');

  const showStatus = (message, { isError = false, showRetry = false } = {}) => {
    statusWrapper.className = isError ? 'status-wrapper error' : 'status-wrapper';
    statusMessage.textContent = message;
    retryButton.className = showRetry ? 'retry-button' : 'retry-button hidden';
  };

  const hideStatus = () => {
    statusWrapper.className = 'status-wrapper hidden';
  };

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

  if (!config?.token) {
    showStatus('Something went wrong. Please close and try again.', { isError: true });
    return;
  }

  const { extensionId = null } = config;

  const notifyExtension = (messageType, payload = null) => {
    if (!extensionId || !chrome?.runtime?.sendMessage) return;

    chrome.runtime.sendMessage(
      extensionId,
      { type: messageType, payload },
      () => void chrome.runtime.lastError
    );
  };

  const requestNewToken = () =>
    new Promise((resolve) => {
      if (!extensionId || !chrome?.runtime?.sendMessage) {
        resolve(null);
        return;
      }

      chrome.runtime.sendMessage(
        extensionId,
        { type: 'sunbit-token-expired' },
        (response) => {
          if (chrome.runtime.lastError || !response?.success) {
            resolve(null);
            return;
          }
          resolve(response);
        }
      );
    });

  const initializePaymentPath = (currentConfig) => {
    showStatus('Connecting to payment service...');

    const {
      sunbitKey = '',
      mode = 'SANDBOX',
      token,
      referenceId,
      orderId,
      totalAmount = 150.0,
      customerDetails = {},
      representativeDetails = {},
    } = currentConfig;

    SUNBIT.init({
      sunbitKey,
      enablePaymentPath: true,
      mode,
    });

    SUNBIT.PaymentPathModule.then((paymentPathModule) => {
      const { init, bindButton } = paymentPathModule;

      init(undefined, {
        token,
        referenceId: referenceId || `ref-${Date.now()}`,
        orderId: orderId || `order-${Date.now()}`,
        totalAmount,
        customerDetails,
        representativeDetails,
        onLoaded: () => {
          bindButton('#sunbit-trigger');
          hideStatus();
          notifyExtension('sunbit-widget-loaded');
          triggerButton.click();
        },
        onLinkSent: () => {
          notifyExtension('sunbit-link-sent');
        },
        onTokenExpired: async () => {
          showStatus('Refreshing session...');
          const tokenResponse = await requestNewToken();

          if (!tokenResponse) {
            showStatus('Your session has expired. Please close and reopen to continue.', {
              isError: true,
            });
            return;
          }

          paymentPathModule.setToken(tokenResponse.token);
        },
      });
    }).catch((error) => {
      showStatus('Something went wrong. Please try again.', { isError: true, showRetry: true });
      notifyExtension('sunbit-error', { message: error.message });
    });
  };

  retryButton.addEventListener('click', () => {
    window.location.reload();
  });

  const startInitialization = () => {
    if (typeof SUNBIT !== 'undefined') {
      notifyExtension('sunbit-sdk-loaded');
      initializePaymentPath(config);
      return;
    }

    window.sunbitAsyncInit = () => {
      notifyExtension('sunbit-sdk-loaded');
      initializePaymentPath(config);
    };

    setTimeout(() => {
      if (typeof SUNBIT === 'undefined') {
        showStatus(
          'Unable to connect to payment service. Please check your connection and try again.',
          { isError: true, showRetry: true }
        );
        notifyExtension('sunbit-error', { message: 'SDK load timeout' });
      }
    }, SDK_LOAD_TIMEOUT_MS);
  };

  startInitialization();
})();
