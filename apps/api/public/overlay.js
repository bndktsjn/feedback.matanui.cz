(function () {
  'use strict';

  // Detect iframe mode FIRST — bridge doesn't need API key
  var IN_IFRAME = false;
  try { IN_IFRAME = window.self !== window.top; } catch (e) { IN_IFRAME = true; }

  var SCRIPT_TAG = document.currentScript;
  var API_KEY = SCRIPT_TAG
    ? SCRIPT_TAG.getAttribute('data-key') || new URL(SCRIPT_TAG.src).searchParams.get('key')
    : null;
  var API_BASE = SCRIPT_TAG
    ? (SCRIPT_TAG.getAttribute('data-api') || new URL(SCRIPT_TAG.src).origin + '/api/v1')
    : '';
  var config = null;
  var isOpen = false;
  var mode = 'panel'; // 'panel' or 'pin'

  // ---- Styles ----
  var STYLES = [
    '#fb-root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;z-index:2147483647}',
    '#fb-trigger{position:fixed;bottom:20px;right:20px;z-index:2147483647;width:48px;height:48px;border-radius:50%;background:#2563eb;color:#fff;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;transition:transform .2s}',
    '#fb-trigger:hover{transform:scale(1.1)}',
    '#fb-trigger svg{width:24px;height:24px;fill:currentColor}',
    '#fb-panel{position:fixed;bottom:80px;right:20px;z-index:2147483647;width:380px;max-height:520px;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.12);overflow:hidden;display:none;flex-direction:column}',
    '#fb-panel.open{display:flex}',
    '#fb-panel-header{padding:16px;background:#2563eb;color:#fff;display:flex;justify-content:space-between;align-items:center}',
    '#fb-panel-header h3{margin:0;font-size:16px;font-weight:600}',
    '#fb-panel-close{background:none;border:none;color:#fff;cursor:pointer;font-size:20px;padding:0 4px}',
    '#fb-panel-body{padding:16px;overflow-y:auto;flex:1}',
    '#fb-panel-body label{display:block;font-size:12px;font-weight:500;color:#6b7280;margin-bottom:4px;margin-top:12px}',
    '#fb-panel-body label:first-child{margin-top:0}',
    '#fb-panel-body input,#fb-panel-body textarea,#fb-panel-body select{width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;outline:none;transition:border-color .15s}',
    '#fb-panel-body input:focus,#fb-panel-body textarea:focus,#fb-panel-body select:focus{border-color:#2563eb}',
    '#fb-panel-body textarea{resize:vertical;min-height:80px}',
    '#fb-panel-footer{padding:12px 16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;gap:8px}',
    '#fb-submit{background:#2563eb;color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500}',
    '#fb-submit:hover{background:#1d4ed8}',
    '#fb-submit:disabled{opacity:.5;cursor:not-allowed}',
    '#fb-mode-toggle{background:none;border:1px solid #d1d5db;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;color:#6b7280}',
    '#fb-mode-toggle:hover{background:#f9fafb}',
    '#fb-pin-cursor{position:fixed;z-index:2147483646;pointer-events:none;display:none}',
    '#fb-pin-cursor svg{width:32px;height:32px}',
    '#fb-success{display:none;padding:32px 16px;text-align:center}',
    '#fb-success.show{display:block}',
    '#fb-success h4{color:#059669;margin:0 0 8px}',
    '.fb-pin-marker{position:absolute;width:24px;height:24px;background:#2563eb;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.2);z-index:2147483646;pointer-events:none;margin-left:-12px;margin-top:-12px}',
  ].join('\n');

  // ---- Init ----
  function init() {
    injectStyles();
    createUI();
    fetchConfig();
  }

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  function createUI() {
    var root = document.createElement('div');
    root.id = 'fb-root';
    root.innerHTML = [
      '<button id="fb-trigger" title="Send Feedback"><svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg></button>',
      '<div id="fb-panel">',
      '  <div id="fb-panel-header"><h3>Send Feedback</h3><button id="fb-panel-close">&times;</button></div>',
      '  <div id="fb-panel-body">',
      '    <label for="fb-title">Title</label>',
      '    <input id="fb-title" type="text" placeholder="Brief summary..." maxlength="255"/>',
      '    <label for="fb-type">Type</label>',
      '    <select id="fb-type"><option value="general">General</option><option value="bug">Bug</option><option value="design">Design</option><option value="content">Content</option></select>',
      '    <label for="fb-priority">Priority</label>',
      '    <select id="fb-priority"><option value="medium">Medium</option><option value="low">Low</option><option value="high">High</option><option value="critical">Critical</option></select>',
      '    <label for="fb-message">Details</label>',
      '    <textarea id="fb-message" placeholder="Describe the issue..."></textarea>',
      '  </div>',
      '  <div id="fb-success"><h4>&#10003; Feedback sent!</h4><p>Thank you for your feedback.</p></div>',
      '  <div id="fb-panel-footer">',
      '    <button id="fb-mode-toggle">Pin mode</button>',
      '    <button id="fb-submit">Send</button>',
      '  </div>',
      '</div>',
      '<div id="fb-pin-cursor"><svg viewBox="0 0 24 24" fill="#2563eb"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>',
    ].join('');
    document.body.appendChild(root);

    // Events
    document.getElementById('fb-trigger').addEventListener('click', togglePanel);
    document.getElementById('fb-panel-close').addEventListener('click', closePanel);
    document.getElementById('fb-submit').addEventListener('click', submitFeedback);
    document.getElementById('fb-mode-toggle').addEventListener('click', toggleMode);
  }

  function fetchConfig() {
    fetch(API_BASE + '/overlay/config?key=' + encodeURIComponent(API_KEY))
      .then(function (r) {
        return r.json();
      })
      .then(function (c) {
        config = c;
      })
      .catch(function (e) {
        console.error('[Feedback] Config fetch failed:', e);
      });
  }

  // ---- UI Logic ----
  var pinX = null,
    pinY = null;

  function togglePanel() {
    isOpen = !isOpen;
    var panel = document.getElementById('fb-panel');
    panel.classList.toggle('open', isOpen);
    if (isOpen) resetForm();
  }

  function closePanel() {
    isOpen = false;
    document.getElementById('fb-panel').classList.remove('open');
    exitPinMode();
  }

  function toggleMode() {
    var btn = document.getElementById('fb-mode-toggle');
    if (mode === 'panel') {
      mode = 'pin';
      btn.textContent = 'Panel mode';
      enterPinMode();
    } else {
      mode = 'panel';
      btn.textContent = 'Pin mode';
      exitPinMode();
    }
  }

  function enterPinMode() {
    document.getElementById('fb-panel').classList.remove('open');
    document.addEventListener('mousemove', onPinMove);
    document.addEventListener('click', onPinClick, true);
    document.getElementById('fb-pin-cursor').style.display = 'block';
    document.body.style.cursor = 'crosshair';
  }

  function exitPinMode() {
    document.removeEventListener('mousemove', onPinMove);
    document.removeEventListener('click', onPinClick, true);
    document.getElementById('fb-pin-cursor').style.display = 'none';
    document.body.style.cursor = '';
    // Remove existing pin markers
    var markers = document.querySelectorAll('.fb-pin-marker');
    markers.forEach(function (m) {
      m.remove();
    });
  }

  function onPinMove(e) {
    var cursor = document.getElementById('fb-pin-cursor');
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
  }

  function onPinClick(e) {
    if (e.target.closest('#fb-root')) return;
    e.preventDefault();
    e.stopPropagation();

    pinX = (e.pageX / document.documentElement.scrollWidth) * 100;
    pinY = (e.pageY / document.documentElement.scrollHeight) * 100;

    // Place pin marker
    var marker = document.createElement('div');
    marker.className = 'fb-pin-marker';
    marker.style.left = e.pageX + 'px';
    marker.style.top = e.pageY + 'px';
    document.body.appendChild(marker);

    exitPinMode();
    document.getElementById('fb-panel').classList.add('open');
    isOpen = true;
  }

  function resetForm() {
    document.getElementById('fb-title').value = '';
    document.getElementById('fb-message').value = '';
    document.getElementById('fb-type').value = 'general';
    document.getElementById('fb-priority').value = 'medium';
    document.getElementById('fb-success').classList.remove('show');
    document.getElementById('fb-panel-body').style.display = '';
    document.getElementById('fb-panel-footer').style.display = '';
    pinX = null;
    pinY = null;
  }

  function getEnvironment() {
    var ua = navigator.userAgent;
    var w = window.innerWidth;
    var viewportMode = w >= 1024 ? 'desktop' : w >= 768 ? 'tablet' : 'mobile';
    return {
      browserName: getBrowserName(ua),
      browserVersion: getBrowserVersion(ua),
      osName: getOSName(ua),
      viewportMode: viewportMode,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      userAgent: ua,
    };
  }

  function getBrowserName(ua) {
    if (ua.indexOf('Firefox') > -1) return 'Firefox';
    if (ua.indexOf('Edg') > -1) return 'Edge';
    if (ua.indexOf('Chrome') > -1) return 'Chrome';
    if (ua.indexOf('Safari') > -1) return 'Safari';
    return 'Unknown';
  }

  function getBrowserVersion(ua) {
    var match = ua.match(/(Firefox|Edg|Chrome|Safari|Version)\/(\d+[\d.]*)/);
    return match ? match[2] : '';
  }

  function getOSName(ua) {
    if (ua.indexOf('Windows') > -1) return 'Windows';
    if (ua.indexOf('Mac') > -1) return 'macOS';
    if (ua.indexOf('Linux') > -1) return 'Linux';
    if (ua.indexOf('Android') > -1) return 'Android';
    if (/iPhone|iPad/.test(ua)) return 'iOS';
    return 'Unknown';
  }

  function submitFeedback() {
    var title = document.getElementById('fb-title').value.trim();
    var message = document.getElementById('fb-message').value.trim();
    if (!title) {
      alert('Please enter a title');
      return;
    }
    if (!message) {
      alert('Please describe the issue');
      return;
    }

    var btn = document.getElementById('fb-submit');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    var w = window.innerWidth;
    var viewport = w >= 1024 ? 'desktop' : w >= 768 ? 'tablet' : 'mobile';

    var body = {
      title: title,
      message: message,
      pageUrl: window.location.href,
      pageTitle: document.title,
      type: document.getElementById('fb-type').value,
      priority: document.getElementById('fb-priority').value,
      contextType: pinX !== null ? 'pin' : 'panel',
      viewport: viewport,
      environment: getEnvironment(),
    };

    if (pinX !== null) {
      body.xPct = Math.round(pinX * 10000) / 10000;
      body.yPct = Math.round(pinY * 10000) / 10000;
    }

    fetch(API_BASE + '/overlay/threads?key=' + encodeURIComponent(API_KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Submit failed');
        return r.json();
      })
      .then(function () {
        document.getElementById('fb-panel-body').style.display = 'none';
        document.getElementById('fb-panel-footer').style.display = 'none';
        document.getElementById('fb-success').classList.add('show');
        setTimeout(function () {
          closePanel();
        }, 2000);
      })
      .catch(function (e) {
        alert('Failed to send feedback: ' + e.message);
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'Send';
      });
  }

  // ---- Bridge Mode (iframe ↔ admin panel communication) ----
  // Mirrors WPF plugin's initIframeBridge: reports scroll, resize, navigation,
  // keyboard events to parent; accepts SCROLL_TO commands.
  function initBridge() {
    var FB = 'FB_';

    // Best-effort: remove meta-based X-Frame-Options (HTTP header version can't be removed by JS)
    try {
      var xfo = document.querySelector('meta[http-equiv="X-Frame-Options"]');
      if (xfo) xfo.remove();
    } catch (e) { /* ignore */ }

    function post(data) {
      try { window.parent.postMessage(data, '*'); } catch (e) { /* ignore */ }
    }

    // -- READY: report initial state --
    function sendReady() {
      post({
        type: FB + 'READY',
        pageUrl: location.href.split('?')[0].split('#')[0],
        pageTitle: document.title,
        docWidth: document.documentElement.scrollWidth,
        docHeight: document.documentElement.scrollHeight,
        vpWidth: window.innerWidth,
        vpHeight: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      });
    }

    // -- SCROLL: report every scroll event --
    window.addEventListener('scroll', function () {
      post({ type: FB + 'SCROLL', scrollX: window.scrollX, scrollY: window.scrollY });
    }, { passive: true });

    // -- RESIZE: report viewport/document dimension changes --
    function sendResize() {
      post({
        type: FB + 'RESIZE',
        docWidth: document.documentElement.scrollWidth,
        docHeight: document.documentElement.scrollHeight,
        vpWidth: window.innerWidth,
        vpHeight: window.innerHeight
      });
    }
    window.addEventListener('resize', sendResize);
    // Poll for document height changes (dynamic content, lazy images, etc.)
    var lastBridgeDocH = 0;
    setInterval(function () {
      var h = document.documentElement.scrollHeight;
      if (h !== lastBridgeDocH) { lastBridgeDocH = h; sendResize(); }
    }, 500);

    // -- NAVIGATED: detect SPA navigation --
    var lastBridgeUrl = location.href;
    function checkNav() {
      if (location.href !== lastBridgeUrl) {
        lastBridgeUrl = location.href;
        post({
          type: FB + 'NAVIGATED',
          pageUrl: location.href.split('?')[0].split('#')[0],
          pageTitle: document.title
        });
        // After navigation, page dimensions likely changed
        setTimeout(sendReady, 200);
      }
    }
    ['pushState', 'replaceState'].forEach(function (method) {
      var orig = history[method];
      history[method] = function () {
        var ret = orig.apply(this, arguments);
        checkNav();
        return ret;
      };
    });
    window.addEventListener('popstate', checkNav);
    window.addEventListener('hashchange', checkNav);
    setInterval(checkNav, 500);

    // -- Accept commands from parent --
    window.addEventListener('message', function (e) {
      if (!e.data || typeof e.data.type !== 'string') return;
      if (e.data.type === FB + 'SCROLL_TO') {
        window.scrollTo({ left: e.data.x || 0, top: e.data.y || 0 });
      }
      if (e.data.type === FB + 'INIT') {
        // Parent requested handshake — re-send READY
        sendReady();
      }
    });

    // -- Forward keyboard shortcuts to parent --
    document.addEventListener('keydown', function (e) {
      var tgt = e.target;
      var isEditable = tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable;
      if ((e.key === 'i' || e.key === 'I') && !isEditable) {
        e.preventDefault();
        post({ type: FB + 'KEY_DOWN', key: 'i' });
      }
      if (e.key === 'Escape') {
        post({ type: FB + 'KEY_DOWN', key: 'Escape' });
      }
    }, true);

    // Send READY once page is loaded
    if (document.readyState === 'complete') sendReady();
    else window.addEventListener('load', sendReady);
    // Retry for SPAs that render asynchronously
    setTimeout(sendReady, 1000);
  }

  // ---- Boot ----
  if (IN_IFRAME) {
    // Bridge mode — communicate with admin panel, suppress widget UI
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initBridge);
    } else {
      initBridge();
    }
  } else {
    // Widget mode — needs API key
    if (!API_KEY) {
      console.error('[Feedback] Missing API key');
    } else {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    }
  }
})();
