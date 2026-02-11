/**
 * FREE RECHARGE INTERCEPTOR
 * ========================
 * This script intercepts all payment/recharge API calls and makes them free.
 * Users can select any amount on the deposit page and get it added to their
 * balance instantly without any real payment.
 *
 * How it works:
 * 1. Intercepts XMLHttpRequest at the lowest level
 * 2. When recharge/payment APIs are called, returns fake success responses
 * 3. Adds the requested amount to a local "bonus balance" stored in localStorage
 * 4. When GetBalance/GetAllwallets APIs respond, adds the bonus balance to the real balance
 * 5. Shows a success toast and navigates back to wallet page
 */

(function () {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  const STORAGE_KEY = 'free_recharge_bonus_balance';
  const RECHARGE_HISTORY_KEY = 'free_recharge_history';

  // API endpoints to intercept (recharge/payment related)
  const RECHARGE_ENDPOINTS = [
    '/api/webapi/ThirdPay',
    '/api/webapi/CreateRechargeOrder',
    '/api/webapi/GetPayUrl',
    '/api/webapi/GetARPayUrl',
    '/api/webapi/GetRSNPayUrl',
    '/api/webapi/Payment',
    '/api/webapi/C2CRecharge',
    '/api/webapi/RechargesUpiOrder',
    '/api/webapi/RechargesUsdtOrder',
    '/api/webapi/NewSetRechargesBankOrder',
    '/api/webapi/NewSetBankQRCodeOrder',
    '/api/webapi/CheckFirstPixRecharge',
  ];

  // API endpoints where we add bonus balance to real balance
  const BALANCE_ENDPOINTS = [
    '/api/webapi/GetBalance',
    '/api/webapi/GetAllwallets',
    '/api/webapi/GetSaasAllwallets',
    '/api/webapi/GetARGameAndPlatWallets',
    '/api/webapi/RecoverBalance',
    '/api/webapi/RecoverSaasBalance',
    '/api/webapi/GetUserInfo',
  ];

  // AR-Wallet / ArUPI payment endpoints
  const AR_WALLET_ENDPOINTS = [
    '/ar-wallet/v4/apiCenter/confirmPayment',
    '/ar-wallet/v4/apiCenter/payWithoutUtr',
    '/ar-wallet/v4/apiCenter/subUtr',
    '/ar-wallet/v4/apiCenter/noPay',
    '/ar-wallet/v4/apiCenter/status',
    '/ar-wallet/v4/apiCenter/fetchThirdPartyRechargePageInfoEncryption',
  ];

  // ============================================
  // BONUS BALANCE MANAGEMENT
  // ============================================
  function getBonusBalance() {
    try {
      return parseFloat(localStorage.getItem(STORAGE_KEY)) || 0;
    } catch (e) {
      return 0;
    }
  }

  function addBonusBalance(amount) {
    const current = getBonusBalance();
    const newBalance = current + parseFloat(amount);
    localStorage.setItem(STORAGE_KEY, newBalance.toString());
    addRechargeHistory(amount);
    return newBalance;
  }

  function addRechargeHistory(amount) {
    try {
      let history = JSON.parse(localStorage.getItem(RECHARGE_HISTORY_KEY) || '[]');
      history.unshift({
        amount: parseFloat(amount),
        time: new Date().toISOString(),
        orderNo: 'FREE-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
        status: 'success'
      });
      // Keep last 100 records
      if (history.length > 100) history = history.slice(0, 100);
      localStorage.setItem(RECHARGE_HISTORY_KEY, JSON.stringify(history));
    } catch (e) { }
  }

  // ============================================
  // EXTRACT AMOUNT FROM REQUEST BODY
  // ============================================
  function extractAmount(body) {
    if (!body) return 0;
    try {
      let data;
      if (typeof body === 'string') {
        try {
          data = JSON.parse(body);
        } catch (e) {
          // Try URL-encoded
          const params = new URLSearchParams(body);
          return parseFloat(params.get('amount')) || parseFloat(params.get('orderAmount')) || parseFloat(params.get('rechargeAmount')) || 0;
        }
      } else if (body instanceof FormData) {
        return parseFloat(body.get('amount')) || parseFloat(body.get('orderAmount')) || parseFloat(body.get('rechargeAmount')) || 0;
      } else {
        data = body;
      }

      if (data) {
        return parseFloat(data.amount) || parseFloat(data.orderAmount) || parseFloat(data.rechargeAmount) || parseFloat(data.price) || 0;
      }
    } catch (e) { }
    return 0;
  }

  // ============================================
  // CHECK IF URL MATCHES INTERCEPTED ENDPOINTS
  // ============================================
  function isRechargeEndpoint(url) {
    if (!url) return false;
    return RECHARGE_ENDPOINTS.some(ep => url.includes(ep));
  }

  function isBalanceEndpoint(url) {
    if (!url) return false;
    return BALANCE_ENDPOINTS.some(ep => url.includes(ep));
  }

  function isArWalletEndpoint(url) {
    if (!url) return false;
    return AR_WALLET_ENDPOINTS.some(ep => url.includes(ep));
  }

  // ============================================
  // GENERATE FAKE SUCCESS RESPONSES
  // ============================================
  function generateRechargeSuccessResponse(amount) {
    const orderNo = 'FREE-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8).toUpperCase();
    return JSON.stringify({
      code: 0,
      msg: 'success',
      msgCode: 0,
      data: {
        redirectUrl: '',
        scanCodePay: false,
        formUrl: '',
        formBody: null,
        submitUrl: '',
        submitType: 0,
        orderResult: 1,
        recommandAmountList: null,
        onGoingOrder: null,
        addThirdPayOrderRsp: null,
        orderNo: orderNo,
        rechargeNumber: orderNo,
        amount: amount,
        state: 1,
        status: 'success'
      }
    });
  }

  function generateC2CRechargeSuccessResponse(amount) {
    return JSON.stringify({
      code: 0,
      msg: 'success',
      msgCode: 0,
      data: {
        state: 1,
        orderId: 'FREE-' + Date.now(),
        errorCount: 0,
        remainingLimitTime: 0,
        suggessList: [],
        rechargeChannelInfo: null
      }
    });
  }

  function generateCheckPixResponse() {
    return JSON.stringify({
      code: 0,
      msg: 'success',
      data: {
        isFirstPixRecharge: false,
        needSetPIX: false
      }
    });
  }

  function generateArWalletSuccessResponse() {
    return JSON.stringify({
      code: 0,
      msg: 'success',
      data: {
        status: 'completed',
        paymentStatus: 'success'
      }
    });
  }

  // ============================================
  // MODIFY BALANCE IN API RESPONSES
  // ============================================
  function addBonusToBalanceResponse(responseText, url) {
    const bonus = getBonusBalance();
    if (bonus <= 0) return responseText;

    try {
      const data = JSON.parse(responseText);
      if (data && data.code === 0 && data.data) {
        // GetBalance response: { code: 0, data: { amount: 1234 } }
        if (typeof data.data.amount === 'number') {
          data.data.amount += bonus;
        } else if (typeof data.data.amount === 'string') {
          data.data.amount = (parseFloat(data.data.amount) + bonus).toString();
        }

        // GetAllwallets: may have different structure
        if (data.data.totalAmount !== undefined) {
          if (typeof data.data.totalAmount === 'number') {
            data.data.totalAmount += bonus;
          } else {
            data.data.totalAmount = (parseFloat(data.data.totalAmount) + bonus).toString();
          }
        }

        // GetUserInfo: may have amount field
        if (url && url.includes('GetUserInfo') && data.data.amount !== undefined) {
          // Already handled above
        }

        // Handle wallet arrays
        if (Array.isArray(data.data)) {
          data.data.forEach(wallet => {
            if (wallet && typeof wallet.amount === 'number' && wallet.typeId === 1) {
              wallet.amount += bonus;
            }
          });
        }

        // Handle allwallets string format
        if (typeof data.data === 'string') {
          try {
            const walletData = JSON.parse(data.data);
            if (walletData && typeof walletData.amount === 'number') {
              walletData.amount += bonus;
              data.data = JSON.stringify(walletData);
            }
          } catch (e) { }
        }

        return JSON.stringify(data);
      }
    } catch (e) { }

    return responseText;
  }

  // ============================================
  // XMLHttpRequest INTERCEPTOR
  // ============================================
  const OriginalXHR = window.XMLHttpRequest;

  function InterceptedXHR() {
    const xhr = new OriginalXHR();
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    let interceptUrl = '';
    let shouldInterceptRecharge = false;
    let shouldInterceptBalance = false;
    let shouldInterceptArWallet = false;
    let requestBody = null;

    xhr.open = function (method, url, ...args) {
      interceptUrl = url || '';
      shouldInterceptRecharge = isRechargeEndpoint(interceptUrl);
      shouldInterceptBalance = isBalanceEndpoint(interceptUrl);
      shouldInterceptArWallet = isArWalletEndpoint(interceptUrl);
      return originalOpen.call(this, method, url, ...args);
    };

    xhr.send = function (body) {
      requestBody = body;

      if (shouldInterceptRecharge) {
        const amount = extractAmount(body);

        if (amount > 0) {
          // Add the amount to bonus balance
          const newBalance = addBonusBalance(amount);
          console.log(`[FREE RECHARGE] Added ₹${amount} to balance. New bonus total: ₹${newBalance}`);

          // Determine which fake response to send
          let fakeResponse;
          if (interceptUrl.includes('C2CRecharge')) {
            fakeResponse = generateC2CRechargeSuccessResponse(amount);
          } else if (interceptUrl.includes('CheckFirstPixRecharge')) {
            fakeResponse = generateCheckPixResponse();
          } else {
            fakeResponse = generateRechargeSuccessResponse(amount);
          }

          // Simulate async response
          setTimeout(() => {
            Object.defineProperty(this, 'readyState', { writable: true, value: 4 });
            Object.defineProperty(this, 'status', { writable: true, value: 200 });
            Object.defineProperty(this, 'statusText', { writable: true, value: 'OK' });
            Object.defineProperty(this, 'responseText', { writable: true, value: fakeResponse });
            Object.defineProperty(this, 'response', { writable: true, value: fakeResponse });

            // Trigger readystatechange
            if (typeof this.onreadystatechange === 'function') {
              this.onreadystatechange(new Event('readystatechange'));
            }
            this.dispatchEvent(new Event('readystatechange'));

            // Trigger load
            if (typeof this.onload === 'function') {
              this.onload(new ProgressEvent('load'));
            }
            this.dispatchEvent(new ProgressEvent('load'));

            // Trigger loadend
            if (typeof this.onloadend === 'function') {
              this.onloadend(new ProgressEvent('loadend'));
            }
            this.dispatchEvent(new ProgressEvent('loadend'));

            // Show success notification
            showRechargeSuccess(amount);
          }, 300 + Math.random() * 200);

          return; // Don't send the real request
        }
      }

      if (shouldInterceptArWallet) {
        const amount = extractAmount(body);
        if (amount > 0) {
          addBonusBalance(amount);
        }

        const fakeResponse = generateArWalletSuccessResponse();
        setTimeout(() => {
          Object.defineProperty(this, 'readyState', { writable: true, value: 4 });
          Object.defineProperty(this, 'status', { writable: true, value: 200 });
          Object.defineProperty(this, 'statusText', { writable: true, value: 'OK' });
          Object.defineProperty(this, 'responseText', { writable: true, value: fakeResponse });
          Object.defineProperty(this, 'response', { writable: true, value: fakeResponse });

          if (typeof this.onreadystatechange === 'function') {
            this.onreadystatechange(new Event('readystatechange'));
          }
          this.dispatchEvent(new Event('readystatechange'));
          if (typeof this.onload === 'function') {
            this.onload(new ProgressEvent('load'));
          }
          this.dispatchEvent(new ProgressEvent('load'));
          if (typeof this.onloadend === 'function') {
            this.onloadend(new ProgressEvent('loadend'));
          }
          this.dispatchEvent(new ProgressEvent('loadend'));
        }, 300);
        return;
      }

      // For balance endpoints, intercept the response to add bonus
      if (shouldInterceptBalance) {
        const originalOnReadyStateChange = this.onreadystatechange;
        const self = this;

        // Override response handling
        this.addEventListener('readystatechange', function () {
          if (this.readyState === 4 && this.status === 200) {
            try {
              const modifiedResponse = addBonusToBalanceResponse(this.responseText, interceptUrl);
              if (modifiedResponse !== this.responseText) {
                Object.defineProperty(this, 'responseText', { writable: true, configurable: true, value: modifiedResponse });
                Object.defineProperty(this, 'response', { writable: true, configurable: true, value: modifiedResponse });
              }
            } catch (e) {
              console.warn('[FREE RECHARGE] Could not modify balance response:', e);
            }
          }
        });
      }

      return originalSend.call(this, body);
    };

    return xhr;
  }

  // Preserve prototype chain
  InterceptedXHR.prototype = OriginalXHR.prototype;
  Object.keys(OriginalXHR).forEach(key => {
    try {
      InterceptedXHR[key] = OriginalXHR[key];
    } catch (e) { }
  });

  window.XMLHttpRequest = InterceptedXHR;

  // ============================================
  // FETCH API INTERCEPTOR (backup)
  // ============================================
  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');

    if (isRechargeEndpoint(url)) {
      let body = init && init.body;
      const amount = extractAmount(body);

      if (amount > 0) {
        addBonusBalance(amount);
        console.log(`[FREE RECHARGE] (fetch) Added ₹${amount} to balance.`);

        const fakeResponse = generateRechargeSuccessResponse(amount);
        showRechargeSuccess(amount);

        return new Response(fakeResponse, {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (isArWalletEndpoint(url)) {
      let body = init && init.body;
      const amount = extractAmount(body);
      if (amount > 0) {
        addBonusBalance(amount);
      }
      return new Response(generateArWalletSuccessResponse(), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // For balance endpoints, modify the response
    if (isBalanceEndpoint(url)) {
      const response = await originalFetch.call(this, input, init);
      const bonus = getBonusBalance();
      if (bonus > 0) {
        try {
          const text = await response.text();
          const modified = addBonusToBalanceResponse(text, url);
          return new Response(modified, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        } catch (e) {
          return response;
        }
      }
      return response;
    }

    return originalFetch.call(this, input, init);
  };

  // ============================================
  // SUCCESS NOTIFICATION
  // ============================================
  function showRechargeSuccess(amount) {
    // Try to use the app's built-in Vant Toast if available
    setTimeout(() => {
      try {
        // Create a custom toast notification
        const toastEl = document.createElement('div');
        toastEl.id = 'free-recharge-toast';
        toastEl.innerHTML = `
          <div style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 99999;
            background: rgba(0,0,0,0.85);
            color: #fff;
            padding: 24px 32px;
            border-radius: 16px;
            text-align: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            min-width: 220px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            animation: freeRechargePopIn 0.3s ease-out;
          ">
            <div style="font-size: 48px; margin-bottom: 12px;">&#10004;</div>
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 8px; color: #4ade80;">Recharge Successful!</div>
            <div style="font-size: 24px; font-weight: 800; color: #fbbf24; margin-bottom: 4px;">+ &#8377;${parseFloat(amount).toLocaleString()}</div>
            <div style="font-size: 13px; color: #9ca3af; margin-top: 8px;">Amount added to your wallet</div>
          </div>
        `;
        document.body.appendChild(toastEl);

        // Add animation keyframes
        if (!document.getElementById('free-recharge-styles')) {
          const style = document.createElement('style');
          style.id = 'free-recharge-styles';
          style.textContent = `
            @keyframes freeRechargePopIn {
              0% { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
              100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            }
            @keyframes freeRechargePopOut {
              0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
              100% { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
            }
          `;
          document.head.appendChild(style);
        }

        // Auto-remove after 2.5 seconds
        setTimeout(() => {
          const toast = document.getElementById('free-recharge-toast');
          if (toast) {
            toast.querySelector('div').style.animation = 'freeRechargePopOut 0.3s ease-in forwards';
            setTimeout(() => toast.remove(), 300);
          }
        }, 2500);

        // Navigate back to wallet/main page after showing success
        setTimeout(() => {
          try {
            // Try to use Vue router if available
            if (window.location.hash) {
              window.location.hash = '#/wallet';
              // Also try dispatching popstate for Vue router
              setTimeout(() => {
                window.location.hash = '#/main';
              }, 200);
            }
          } catch (e) { }
        }, 2800);

      } catch (e) {
        console.log('[FREE RECHARGE] Notification error:', e);
      }
    }, 100);
  }

  // ============================================
  // LOG INITIALIZATION
  // ============================================
  console.log('%c[FREE RECHARGE] Payment interceptor active! All recharges are now FREE.', 'color: #4ade80; font-size: 14px; font-weight: bold;');
  console.log('%c[FREE RECHARGE] Current bonus balance: ₹' + getBonusBalance(), 'color: #fbbf24; font-size: 12px;');

})();
