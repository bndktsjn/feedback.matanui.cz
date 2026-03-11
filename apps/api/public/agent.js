/**
 * Feedback Agent v1.0
 * In-page feedback widget — runs directly in the client's page context.
 * Zero cross-origin issues. No iframe bridge needed.
 *
 * Usage: <script src="https://feedback.matanui.cz/static/agent.js" data-key="fb_xxx"></script>
 */
(function () {
  'use strict';

  // ── Prevent double-init ──
  if (window.__fbAgent) return;
  window.__fbAgent = true;

  // ── Config from script tag ──
  var SCRIPT = document.currentScript;
  var API_KEY = SCRIPT
    ? SCRIPT.getAttribute('data-key') || new URL(SCRIPT.src).searchParams.get('key')
    : null;
  var API_BASE = SCRIPT
    ? (SCRIPT.getAttribute('data-api') || new URL(SCRIPT.src).origin + '/api/v1')
    : '';

  // Don't initialize in iframes (old bridge overlay.js handles that)
  try { if (window.self !== window.top) return; } catch (e) { return; }
  if (!API_KEY) { console.warn('[FBAgent] Missing API key'); return; }

  // ── State ──
  var config = null;
  var isOpen = false;
  var isPinMode = false;
  var pinData = null;       // { xPct, yPct, selector, anchorData }
  var existingPins = [];    // threads from API
  var activeThread = null;  // thread detail open in panel
  var shadow = null;        // Shadow DOM root
  var agentRoot = null;     // host element

  // ── Offline Queue ──
  var QUEUE_KEY = 'fb_agent_queue';
  function getQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) { /* quota */ }
  }
  function enqueue(payload) {
    var q = getQueue();
    payload._queuedAt = Date.now();
    q.push(payload);
    saveQueue(q);
    updateQueueBadge();
  }
  function flushQueue() {
    var q = getQueue();
    if (!q.length) return;
    console.log('[FBAgent] Flushing offline queue:', q.length, 'items');
    saveQueue([]); // clear immediately to avoid duplicate flushes
    var failed = [];
    var chain = Promise.resolve();
    q.forEach(function (item) {
      chain = chain.then(function () {
        var payload = Object.assign({}, item);
        delete payload._queuedAt;
        return apiPost('/overlay/threads', payload).catch(function () {
          failed.push(item);
        });
      });
    });
    chain.then(function () {
      if (failed.length) {
        saveQueue(failed.concat(getQueue()));
        console.warn('[FBAgent] Queue flush: ' + failed.length + ' items still pending');
      } else {
        console.log('[FBAgent] Queue flushed successfully');
        loadPins();
      }
      updateQueueBadge();
    });
  }
  function updateQueueBadge() {
    if (!shadow) return;
    var badge = shadow.querySelector('.fb-queue-badge');
    var count = getQueue().length;
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  // ── Canonical URL (strip hash + trailing slash) ──
  function canonical(url) {
    try { return url.split('#')[0].replace(/\/+$/, ''); } catch (e) { return url; }
  }

  // ── API helpers ──
  function apiGet(path) {
    return fetch(API_BASE + path + (path.indexOf('?') > -1 ? '&' : '?') + 'key=' + encodeURIComponent(API_KEY))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.statusText); });
  }
  function apiPost(path, body) {
    return fetch(API_BASE + path + (path.indexOf('?') > -1 ? '&' : '?') + 'key=' + encodeURIComponent(API_KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.statusText); });
  }
  function apiPatch(path, body) {
    return fetch(API_BASE + path + (path.indexOf('?') > -1 ? '&' : '?') + 'key=' + encodeURIComponent(API_KEY), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.statusText); });
  }

  // ── CSS Selector Generator ──
  function getSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return 'body';
    if (el.id) return '#' + CSS.escape(el.id);
    var parts = [];
    var current = el;
    var depth = 0;
    while (current && current !== document.body && current !== document.documentElement && depth < 8) {
      var tag = current.tagName.toLowerCase();
      if (current.id) { parts.unshift('#' + CSS.escape(current.id)); break; }
      var parent = current.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function (c) { return c.tagName === current.tagName; });
        if (siblings.length > 1) {
          var idx = siblings.indexOf(current) + 1;
          tag += ':nth-of-type(' + idx + ')';
        }
      }
      parts.unshift(tag);
      current = parent;
      depth++;
    }
    var sel = parts.join(' > ');
    // Validate
    try { if (document.querySelector(sel) === el) return sel; } catch (e) { /* invalid */ }
    return '';
  }

  // ── Environment ──
  function getEnv() {
    var ua = navigator.userAgent;
    var w = window.innerWidth;
    return {
      browserName: /Firefox/.test(ua) ? 'Firefox' : /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'Unknown',
      browserVersion: (ua.match(/(Firefox|Edg|Chrome|Safari|Version)\/(\d+[\d.]*)/) || [])[2] || '',
      osName: /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : 'Unknown',
      viewportMode: w >= 1024 ? 'desktop' : w >= 768 ? 'tablet' : 'mobile',
      viewportWidth: w,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      userAgent: ua,
    };
  }

  function getViewport() {
    var w = window.innerWidth;
    return w >= 1024 ? 'desktop' : w >= 768 ? 'tablet' : 'mobile';
  }

  // ── html2canvas lazy loader ──
  var h2cPromise = null;
  function loadH2C() {
    if (h2cPromise) return h2cPromise;
    if (window.html2canvas) { h2cPromise = Promise.resolve(window.html2canvas); return h2cPromise; }
    h2cPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = function () { resolve(window.html2canvas); };
      s.onerror = function () { reject(new Error('html2canvas load failed')); };
      document.head.appendChild(s);
    });
    return h2cPromise;
  }

  function captureScreenshot() {
    if (agentRoot) agentRoot.style.display = 'none';
    // Hide pin markers during capture
    var pinEls = document.querySelectorAll('.fb-agent-pin');
    pinEls.forEach(function (p) { p.style.display = 'none'; });
    return loadH2C().then(function (html2canvas) {
      return html2canvas(document.body, {
        useCORS: true, allowTaint: false, logging: false,
        scale: window.devicePixelRatio || 1,
        width: window.innerWidth, height: window.innerHeight,
        scrollX: -window.scrollX, scrollY: -window.scrollY,
        windowWidth: window.innerWidth, windowHeight: window.innerHeight,
      });
    }).then(function (canvas) {
      if (agentRoot) agentRoot.style.display = '';
      pinEls.forEach(function (p) { p.style.display = ''; });
      // Draw pin marker on screenshot if present
      if (pinData && pinData.xPct != null) {
        var ctx = canvas.getContext('2d');
        if (ctx) {
          var dpr = window.devicePixelRatio || 1;
          var docW = document.documentElement.scrollWidth;
          var docH = document.documentElement.scrollHeight;
          var absX = (pinData.xPct / 100) * docW - window.scrollX;
          var absY = (pinData.yPct / 100) * docH - window.scrollY;
          var cx = absX * dpr, cy = absY * dpr;
          if (cx >= 0 && cx <= canvas.width && cy >= 0 && cy <= canvas.height) {
            var r = 12 * dpr;
            ctx.save(); ctx.translate(cx, cy);
            ctx.beginPath(); ctx.arc(0, -r, r, Math.PI * 0.75, Math.PI * 2.25);
            ctx.lineTo(0, r * 0.4); ctx.closePath();
            ctx.fillStyle = '#f97316'; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr; ctx.stroke();
            ctx.beginPath(); ctx.arc(0, -r, r * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = '#fff'; ctx.fill();
            ctx.restore();
          }
        }
      }
      return canvas.toDataURL('image/png', 0.85);
    }).catch(function () {
      if (agentRoot) agentRoot.style.display = '';
      pinEls.forEach(function (p) { p.style.display = ''; });
      return null;
    });
  }

  // ══════════════════════════════════════════════════════════
  // STYLES (injected into Shadow DOM)
  // ══════════════════════════════════════════════════════════
  var AGENT_CSS = [
    ':host{all:initial;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.5;color:#1f2937}',
    '*,*::before,*::after{box-sizing:border-box}',
    // Trigger button
    '.fb-trigger{position:fixed;bottom:20px;right:20px;z-index:2147483647;width:48px;height:48px;border-radius:50%;background:#2563eb;color:#fff;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;transition:transform .2s,background .2s}',
    '.fb-trigger:hover{transform:scale(1.1);background:#1d4ed8}',
    '.fb-trigger svg{width:24px;height:24px;fill:currentColor}',
    '.fb-trigger.active{background:#dc2626}',
    // Panel
    '.fb-panel{position:fixed;bottom:80px;right:20px;z-index:2147483647;width:380px;max-height:560px;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.15);display:none;flex-direction:column;overflow:hidden}',
    '@media(max-width:480px){.fb-panel{left:8px;right:8px;bottom:72px;width:auto;max-height:70vh;border-radius:10px}.fb-trigger{bottom:12px;right:12px;width:44px;height:44px}}',
    '.fb-queue-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;background:#f59e0b;color:#fff;border-radius:9px;font-size:10px;font-weight:700;display:none;align-items:center;justify-content:center;padding:0 4px}',
    '.fb-panel.open{display:flex}',
    '.fb-panel-header{padding:14px 16px;background:#2563eb;color:#fff;display:flex;justify-content:space-between;align-items:center}',
    '.fb-panel-header h3{margin:0;font-size:15px;font-weight:600}',
    '.fb-panel-close{background:none;border:none;color:#fff;cursor:pointer;font-size:20px;padding:0 4px;line-height:1}',
    '.fb-panel-body{padding:16px;overflow-y:auto;flex:1}',
    '.fb-panel-body label{display:block;font-size:12px;font-weight:500;color:#6b7280;margin:10px 0 4px}',
    '.fb-panel-body label:first-child{margin-top:0}',
    '.fb-panel-body input,.fb-panel-body textarea,.fb-panel-body select{width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;outline:none;transition:border-color .15s;font-family:inherit}',
    '.fb-panel-body input:focus,.fb-panel-body textarea:focus,.fb-panel-body select:focus{border-color:#2563eb}',
    '.fb-panel-body textarea{resize:vertical;min-height:80px}',
    '.fb-panel-footer{padding:12px 16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;gap:8px}',
    '.fb-btn{background:#2563eb;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;transition:background .15s}',
    '.fb-btn:hover{background:#1d4ed8}',
    '.fb-btn:disabled{opacity:.5;cursor:not-allowed}',
    '.fb-btn-outline{background:none;border:1px solid #d1d5db;color:#6b7280;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;transition:background .15s}',
    '.fb-btn-outline:hover{background:#f3f4f6}',
    '.fb-btn-outline.active{border-color:#2563eb;color:#2563eb;background:#eff6ff}',
    // Pin indicator in form
    '.fb-pin-badge{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;font-size:12px;color:#2563eb;margin-bottom:8px}',
    '.fb-pin-badge svg{width:14px;height:14px;fill:#2563eb}',
    // Success
    '.fb-success{display:none;padding:32px 16px;text-align:center}',
    '.fb-success.show{display:block}',
    '.fb-success h4{color:#059669;margin:0 0 8px;font-size:16px}',
    '.fb-success p{margin:0;color:#6b7280;font-size:13px}',
    // Pin cursor
    '.fb-pin-cursor{position:fixed;z-index:2147483646;pointer-events:none;display:none}',
    '.fb-pin-cursor svg{width:32px;height:32px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.2))}',
    // Thread detail (inline)
    '.fb-thread{padding:0}',
    '.fb-thread-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}',
    '.fb-thread-title{font-size:14px;font-weight:600;margin:0;color:#111827;flex:1}',
    '.fb-thread-status{font-size:11px;padding:2px 8px;border-radius:10px;font-weight:500;white-space:nowrap}',
    '.fb-thread-status.open{background:#fef3c7;color:#92400e}',
    '.fb-thread-status.resolved{background:#d1fae5;color:#065f46}',
    '.fb-thread-msg{font-size:13px;color:#4b5563;margin:0 0 12px;white-space:pre-wrap}',
    '.fb-comments{border-top:1px solid #e5e7eb;padding-top:8px}',
    '.fb-comment{padding:6px 0;border-bottom:1px solid #f3f4f6}',
    '.fb-comment:last-child{border-bottom:none}',
    '.fb-comment-author{font-size:11px;font-weight:600;color:#6b7280}',
    '.fb-comment-text{font-size:13px;color:#374151;margin:2px 0 0;white-space:pre-wrap}',
    '.fb-comment-time{font-size:10px;color:#9ca3af}',
    '.fb-add-comment{display:flex;gap:6px;margin-top:8px}',
    '.fb-add-comment input{flex:1;padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;outline:none}',
    '.fb-add-comment input:focus{border-color:#2563eb}',
    '.fb-add-comment button{padding:6px 12px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer}',
    '.fb-back{background:none;border:none;cursor:pointer;color:#6b7280;font-size:12px;padding:0;display:flex;align-items:center;gap:4px;margin-bottom:8px}',
    '.fb-back:hover{color:#111827}',
    // Existing pin markers (in page DOM, not shadow)
  ].join('\n');

  // ══════════════════════════════════════════════════════════
  // PIN MARKERS (in document DOM, not shadow — must scroll with page)
  // ══════════════════════════════════════════════════════════
  var PIN_MARKER_CSS = [
    '.fb-agent-pin{position:absolute;z-index:2147483640;cursor:pointer;pointer-events:auto;transition:transform .15s}',
    '.fb-agent-pin:hover{transform:scale(1.2)}',
    '.fb-agent-pin-dot{width:28px;height:28px;border-radius:50%;background:#2563eb;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff}',
    '.fb-agent-pin-count{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;background:#dc2626;color:#fff;border-radius:8px;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 4px}',
  ].join('\n');

  // Inject pin marker styles into document head (not shadow — pins live in page DOM)
  function injectPinStyles() {
    if (document.getElementById('fb-agent-pin-styles')) return;
    var s = document.createElement('style');
    s.id = 'fb-agent-pin-styles';
    s.textContent = PIN_MARKER_CSS;
    document.head.appendChild(s);
  }

  // ══════════════════════════════════════════════════════════
  // UI CREATION (inside Shadow DOM)
  // ══════════════════════════════════════════════════════════
  function createUI() {
    agentRoot = document.createElement('div');
    agentRoot.id = 'fb-agent';
    shadow = agentRoot.attachShadow({ mode: 'closed' });

    var style = document.createElement('style');
    style.textContent = AGENT_CSS;
    shadow.appendChild(style);

    var wrapper = document.createElement('div');
    wrapper.innerHTML = [
      // Trigger
      '<button class="fb-trigger" title="Send Feedback">',
      '  <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>',
      '  <span class="fb-queue-badge" style="display:none"></span>',
      '</button>',
      // Panel
      '<div class="fb-panel">',
      '  <div class="fb-panel-header">',
      '    <h3>Send Feedback</h3>',
      '    <button class="fb-panel-close">&times;</button>',
      '  </div>',
      '  <div class="fb-panel-body" id="fb-form-view">',
      '    <label>Title</label>',
      '    <input class="fb-input-title" type="text" placeholder="Brief summary..." maxlength="255"/>',
      '    <label>Type</label>',
      '    <select class="fb-input-type">',
      '      <option value="general">General</option><option value="bug">Bug</option>',
      '      <option value="design">Design</option><option value="content">Content</option>',
      '    </select>',
      '    <label>Priority</label>',
      '    <select class="fb-input-priority">',
      '      <option value="medium">Medium</option><option value="low">Low</option>',
      '      <option value="high">High</option><option value="critical">Critical</option>',
      '    </select>',
      '    <label>Details</label>',
      '    <textarea class="fb-input-message" placeholder="Describe the issue..."></textarea>',
      '  </div>',
      '  <div class="fb-success"><h4>&#10003; Feedback sent!</h4><p>Thank you for your feedback.</p></div>',
      '  <div class="fb-panel-footer">',
      '    <button class="fb-btn-outline fb-mode-toggle">&#128204; Pin mode</button>',
      '    <button class="fb-btn fb-submit">Send</button>',
      '  </div>',
      '</div>',
      // Pin cursor
      '<div class="fb-pin-cursor">',
      '  <svg viewBox="0 0 24 24" fill="#2563eb"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
      '</div>',
    ].join('');
    shadow.appendChild(wrapper);
    document.body.appendChild(agentRoot);

    // Event bindings
    var trigger = shadow.querySelector('.fb-trigger');
    var panel = shadow.querySelector('.fb-panel');
    var closeBtn = shadow.querySelector('.fb-panel-close');
    var submitBtn = shadow.querySelector('.fb-submit');
    var modeBtn = shadow.querySelector('.fb-mode-toggle');

    trigger.addEventListener('click', function () {
      if (isPinMode) { exitPinMode(); return; }
      if (activeThread) { activeThread = null; renderFormView(); }
      isOpen = !isOpen;
      panel.classList.toggle('open', isOpen);
      trigger.classList.toggle('active', isOpen);
      if (isOpen) resetForm();
    });
    closeBtn.addEventListener('click', function () {
      isOpen = false;
      panel.classList.remove('open');
      trigger.classList.remove('active');
      exitPinMode();
      activeThread = null;
    });
    submitBtn.addEventListener('click', submitFeedback);
    modeBtn.addEventListener('click', function () {
      if (isPinMode) {
        exitPinMode();
      } else {
        enterPinMode();
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // PIN MODE
  // ══════════════════════════════════════════════════════════
  var isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  function enterPinMode() {
    isPinMode = true;
    var panel = shadow.querySelector('.fb-panel');
    panel.classList.remove('open');
    shadow.querySelector('.fb-trigger').classList.add('active');
    shadow.querySelector('.fb-mode-toggle').classList.add('active');
    shadow.querySelector('.fb-mode-toggle').textContent = '\u2715 Cancel pin';
    if (!isTouchDevice) {
      shadow.querySelector('.fb-pin-cursor').style.display = 'block';
      document.body.style.cursor = 'crosshair';
      document.addEventListener('mousemove', onPinMove, true);
    }
    document.addEventListener('click', onPinClick, true);
    document.addEventListener('touchend', onPinTouch, true);
    document.addEventListener('keydown', onPinEscape, true);
  }

  function exitPinMode() {
    isPinMode = false;
    shadow.querySelector('.fb-trigger').classList.remove('active');
    shadow.querySelector('.fb-mode-toggle').classList.remove('active');
    shadow.querySelector('.fb-mode-toggle').textContent = '\u{1F4CC} Pin mode';
    shadow.querySelector('.fb-pin-cursor').style.display = 'none';
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onPinMove, true);
    document.removeEventListener('click', onPinClick, true);
    document.removeEventListener('touchend', onPinTouch, true);
    document.removeEventListener('keydown', onPinEscape, true);
  }

  function onPinMove(e) {
    var cursor = shadow.querySelector('.fb-pin-cursor');
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
  }

  function onPinClick(e) {
    // Ignore clicks on agent UI
    if (e.target.closest && e.target.closest('#fb-agent')) return;
    e.preventDefault();
    e.stopPropagation();

    var docW = document.documentElement.scrollWidth;
    var docH = document.documentElement.scrollHeight;
    var xPct = (e.pageX / docW) * 100;
    var yPct = (e.pageY / docH) * 100;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    var selector = el ? getSelector(el) : '';

    pinData = {
      xPct: Math.round(xPct * 10000) / 10000,
      yPct: Math.round(yPct * 10000) / 10000,
      selector: selector,
      anchorData: el ? {
        tagName: el.tagName,
        textPreview: (el.textContent || '').substring(0, 80).trim(),
        rect: el.getBoundingClientRect().toJSON(),
        scrollY: window.scrollY,
      } : null,
    };

    // Place a temporary pin marker
    removeTempPin();
    var marker = document.createElement('div');
    marker.className = 'fb-agent-pin fb-agent-pin-temp';
    marker.innerHTML = '<div class="fb-agent-pin-dot">&#9679;</div>';
    marker.style.left = (e.pageX - 14) + 'px';
    marker.style.top = (e.pageY - 14) + 'px';
    document.body.appendChild(marker);

    exitPinMode();
    // Open panel with pin badge
    isOpen = true;
    shadow.querySelector('.fb-panel').classList.add('open');
    renderFormView();
  }

  function onPinTouch(e) {
    if (!isPinMode) return;
    // Ignore touches on agent UI
    if (e.target.closest && e.target.closest('#fb-agent')) return;
    e.preventDefault();
    var touch = e.changedTouches[0];
    if (!touch) return;
    var docW = document.documentElement.scrollWidth;
    var docH = document.documentElement.scrollHeight;
    var pageX = touch.pageX, pageY = touch.pageY;
    var xPct = (pageX / docW) * 100;
    var yPct = (pageY / docH) * 100;
    var el = document.elementFromPoint(touch.clientX, touch.clientY);
    var selector = el ? getSelector(el) : '';
    pinData = {
      xPct: Math.round(xPct * 10000) / 10000,
      yPct: Math.round(yPct * 10000) / 10000,
      selector: selector,
      anchorData: el ? {
        tagName: el.tagName,
        textPreview: (el.textContent || '').substring(0, 80).trim(),
        rect: el.getBoundingClientRect().toJSON(),
        scrollY: window.scrollY,
      } : null,
    };
    removeTempPin();
    var marker = document.createElement('div');
    marker.className = 'fb-agent-pin fb-agent-pin-temp';
    marker.innerHTML = '<div class="fb-agent-pin-dot">&#9679;</div>';
    marker.style.left = (pageX - 14) + 'px';
    marker.style.top = (pageY - 14) + 'px';
    document.body.appendChild(marker);
    exitPinMode();
    isOpen = true;
    shadow.querySelector('.fb-panel').classList.add('open');
    renderFormView();
  }

  function onPinEscape(e) {
    if (e.key === 'Escape') { exitPinMode(); }
  }

  function removeTempPin() {
    var temp = document.querySelector('.fb-agent-pin-temp');
    if (temp) temp.remove();
  }

  // ══════════════════════════════════════════════════════════
  // FORM VIEW / THREAD DETAIL VIEW
  // ══════════════════════════════════════════════════════════
  function renderFormView() {
    var body = shadow.querySelector('.fb-panel-body');
    var footer = shadow.querySelector('.fb-panel-footer');
    var success = shadow.querySelector('.fb-success');
    var header = shadow.querySelector('.fb-panel-header h3');

    success.classList.remove('show');
    body.style.display = '';
    footer.style.display = '';

    if (activeThread) {
      header.textContent = 'Thread';
      renderThreadDetail(body);
      footer.style.display = 'none';
      return;
    }

    header.textContent = 'Send Feedback';
    var pinBadge = pinData
      ? '<div class="fb-pin-badge"><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg> Pin placed</div>'
      : '';

    body.innerHTML = [
      pinBadge,
      '<label>Title</label>',
      '<input class="fb-input-title" type="text" placeholder="Brief summary..." maxlength="255"/>',
      '<label>Type</label>',
      '<select class="fb-input-type">',
      '  <option value="general">General</option><option value="bug">Bug</option>',
      '  <option value="design">Design</option><option value="content">Content</option>',
      '</select>',
      '<label>Priority</label>',
      '<select class="fb-input-priority">',
      '  <option value="medium">Medium</option><option value="low">Low</option>',
      '  <option value="high">High</option><option value="critical">Critical</option>',
      '</select>',
      '<label>Details</label>',
      '<textarea class="fb-input-message" placeholder="Describe the issue..."></textarea>',
    ].join('');
  }

  function renderThreadDetail(container) {
    var t = activeThread;
    var authorName = t.author ? (t.author.displayName || t.author.email) : (t.guestEmail || 'Anonymous');
    var statusClass = t.status === 'resolved' ? 'resolved' : 'open';

    var commentsHtml = '';
    if (t.comments && t.comments.length) {
      commentsHtml = '<div class="fb-comments">';
      t.comments.forEach(function (c) {
        var cAuthor = c.author ? (c.author.displayName || c.author.email) : (c.guestEmail || 'Anonymous');
        var cTime = new Date(c.createdAt).toLocaleString();
        commentsHtml += '<div class="fb-comment">';
        commentsHtml += '<span class="fb-comment-author">' + esc(cAuthor) + '</span> ';
        commentsHtml += '<span class="fb-comment-time">' + cTime + '</span>';
        commentsHtml += '<p class="fb-comment-text">' + esc(c.content) + '</p>';
        commentsHtml += '</div>';
      });
      commentsHtml += '</div>';
    }

    container.innerHTML = [
      '<button class="fb-back">&larr; Back</button>',
      '<div class="fb-thread">',
      '  <div class="fb-thread-header">',
      '    <h4 class="fb-thread-title">' + esc(t.title) + '</h4>',
      '    <span class="fb-thread-status ' + statusClass + '">' + t.status + '</span>',
      '  </div>',
      '  <p class="fb-thread-msg">' + esc(t.message) + '</p>',
      '  <div style="font-size:11px;color:#9ca3af;margin-bottom:8px">' + esc(authorName) + ' &middot; ' + new Date(t.createdAt).toLocaleString() + '</div>',
      commentsHtml,
      '  <div class="fb-add-comment">',
      '    <input class="fb-comment-input" placeholder="Add a comment..." />',
      '    <button class="fb-comment-send">Send</button>',
      '  </div>',
      '</div>',
    ].join('');

    // Back button
    container.querySelector('.fb-back').addEventListener('click', function () {
      activeThread = null;
      renderFormView();
    });

    // Comment submission
    var commentInput = container.querySelector('.fb-comment-input');
    var commentSend = container.querySelector('.fb-comment-send');
    commentSend.addEventListener('click', function () {
      var content = commentInput.value.trim();
      if (!content) return;
      commentSend.disabled = true;
      apiPost('/overlay/threads/' + t.id + '/comments', { content: content })
        .then(function () {
          // Refresh thread detail
          return apiGet('/overlay/threads/' + t.id);
        })
        .then(function (updated) {
          activeThread = updated;
          renderThreadDetail(container);
        })
        .catch(function () { commentSend.disabled = false; });
    });
  }

  function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function resetForm() {
    pinData = null;
    removeTempPin();
    activeThread = null;
    renderFormView();
  }

  // ══════════════════════════════════════════════════════════
  // SUBMIT FEEDBACK
  // ══════════════════════════════════════════════════════════
  function submitFeedback() {
    var title = shadow.querySelector('.fb-input-title');
    var message = shadow.querySelector('.fb-input-message');
    if (!title || !title.value.trim()) { alert('Please enter a title'); return; }
    if (!message || !message.value.trim()) { alert('Please describe the issue'); return; }

    var btn = shadow.querySelector('.fb-submit');
    btn.disabled = true;
    btn.textContent = 'Capturing…';

    var body = {
      title: title.value.trim(),
      message: message.value.trim(),
      pageUrl: canonical(location.href),
      pageTitle: document.title,
      type: shadow.querySelector('.fb-input-type').value,
      priority: shadow.querySelector('.fb-input-priority').value,
      contextType: pinData ? 'pin' : 'panel',
      viewport: getViewport(),
      environment: getEnv(),
    };

    if (pinData) {
      body.xPct = pinData.xPct;
      body.yPct = pinData.yPct;
      body.targetSelector = pinData.selector;
      body.anchorData = pinData.anchorData;
    }

    captureScreenshot().then(function (dataUrl) {
      if (dataUrl) body.screenshotDataUrl = dataUrl;
      btn.textContent = 'Sending…';
      return apiPost('/overlay/threads', body);
    }).then(function () {
      shadow.querySelector('.fb-panel-body').style.display = 'none';
      shadow.querySelector('.fb-panel-footer').style.display = 'none';
      shadow.querySelector('.fb-success').classList.add('show');
      removeTempPin();
      pinData = null;
      setTimeout(function () {
        isOpen = false;
        shadow.querySelector('.fb-panel').classList.remove('open');
        shadow.querySelector('.fb-trigger').classList.remove('active');
        shadow.querySelector('.fb-success').classList.remove('show');
        loadPins(); // Refresh pins
      }, 2000);
    }).catch(function (e) {
      // Offline or network error — queue for retry
      if (!navigator.onLine || (e && (e.message === 'Failed to fetch' || e === 'Failed to fetch'))) {
        enqueue(body);
        shadow.querySelector('.fb-panel-body').style.display = 'none';
        shadow.querySelector('.fb-panel-footer').style.display = 'none';
        var success = shadow.querySelector('.fb-success');
        success.querySelector('h4').textContent = '\u{1F4E6} Saved offline';
        success.querySelector('p').textContent = 'Will send automatically when you\'re back online.';
        success.classList.add('show');
        removeTempPin();
        pinData = null;
        setTimeout(function () {
          isOpen = false;
          shadow.querySelector('.fb-panel').classList.remove('open');
          shadow.querySelector('.fb-trigger').classList.remove('active');
          success.classList.remove('show');
          success.querySelector('h4').innerHTML = '&#10003; Feedback sent!';
          success.querySelector('p').textContent = 'Thank you for your feedback.';
        }, 2500);
      } else {
        alert('Failed to send: ' + e);
      }
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = 'Send';
    });
  }

  // ══════════════════════════════════════════════════════════
  // EXISTING PINS — fetch + render in page DOM
  // ══════════════════════════════════════════════════════════
  function loadPins() {
    var pageUrl = canonical(location.href);
    var viewport = getViewport();
    apiGet('/overlay/threads?pageUrl=' + encodeURIComponent(pageUrl) + '&viewport=' + viewport + '&status=open')
      .then(function (threads) {
        existingPins = threads.filter(function (t) {
          return t.contextType === 'pin' && t.xPct != null && t.yPct != null;
        });
        renderPins();
      })
      .catch(function (e) {
        console.warn('[FBAgent] Failed to load pins:', e);
      });
  }

  function renderPins() {
    // Remove existing pin markers
    document.querySelectorAll('.fb-agent-pin:not(.fb-agent-pin-temp)').forEach(function (p) { p.remove(); });

    var docW = document.documentElement.scrollWidth;
    var docH = document.documentElement.scrollHeight;

    existingPins.forEach(function (t, idx) {
      var el = null;
      // Try CSS selector first
      if (t.targetSelector) {
        try { el = document.querySelector(t.targetSelector); } catch (e) { /* invalid */ }
      }

      var marker = document.createElement('div');
      marker.className = 'fb-agent-pin';
      marker.setAttribute('data-thread-id', t.id);

      var countBadge = t._count && t._count.comments > 0
        ? '<span class="fb-agent-pin-count">' + t._count.comments + '</span>'
        : '';
      marker.innerHTML = '<div class="fb-agent-pin-dot">' + (idx + 1) + '</div>' + countBadge;

      if (el) {
        // Position relative to element
        var rect = el.getBoundingClientRect();
        marker.style.left = (rect.left + window.scrollX + rect.width / 2 - 14) + 'px';
        marker.style.top = (rect.top + window.scrollY - 14) + 'px';
      } else {
        // Fallback: percentage coordinates
        marker.style.left = ((t.xPct / 100) * docW - 14) + 'px';
        marker.style.top = ((t.yPct / 100) * docH - 14) + 'px';
      }

      marker.addEventListener('click', function (e) {
        e.stopPropagation();
        openThread(t.id);
      });

      document.body.appendChild(marker);
    });
  }

  function openThread(threadId) {
    apiGet('/overlay/threads/' + threadId)
      .then(function (thread) {
        if (!thread || !thread.id) return;
        activeThread = thread;
        isOpen = true;
        shadow.querySelector('.fb-panel').classList.add('open');
        shadow.querySelector('.fb-trigger').classList.add('active');
        renderFormView();
      })
      .catch(function (e) {
        console.warn('[FBAgent] Failed to load thread:', e);
      });
  }

  // ══════════════════════════════════════════════════════════
  // NAVIGATION DETECTION
  // ══════════════════════════════════════════════════════════
  var lastUrl = canonical(location.href);

  function checkNav() {
    var current = canonical(location.href);
    if (current !== lastUrl) {
      lastUrl = current;
      loadPins();
    }
  }

  function setupNavDetection() {
    // Intercept History API (SPA)
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
    // Poll fallback (500ms)
    setInterval(checkNav, 500);
  }

  // ══════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS
  // ══════════════════════════════════════════════════════════
  function setupKeyboard() {
    document.addEventListener('keydown', function (e) {
      var tgt = e.target;
      var isEditable = tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable;
      if (isEditable) return;

      // 'F' to toggle feedback panel
      if (e.key === 'f' || e.key === 'F') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          // Only plain 'f' without modifiers — too intrusive. Use Escape instead.
        }
      }
      // Escape to close panel / cancel pin mode
      if (e.key === 'Escape') {
        if (isPinMode) { exitPinMode(); }
        else if (isOpen) {
          isOpen = false;
          shadow.querySelector('.fb-panel').classList.remove('open');
          shadow.querySelector('.fb-trigger').classList.remove('active');
          activeThread = null;
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // REPOSITION PINS on scroll/resize
  // ══════════════════════════════════════════════════════════
  function setupPinReposition() {
    var ticking = false;
    function reposition() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        renderPins();
        ticking = false;
      });
    }
    window.addEventListener('scroll', reposition, { passive: true });
    window.addEventListener('resize', reposition);
  }

  // ══════════════════════════════════════════════════════════
  // BOOT
  // ══════════════════════════════════════════════════════════
  function boot() {
    console.log('[FBAgent] Initializing, key:', API_KEY.substring(0, 8) + '...');
    injectPinStyles();
    createUI();
    setupNavDetection();
    setupKeyboard();
    setupPinReposition();

    // Online/offline queue handling
    window.addEventListener('online', function () {
      console.log('[FBAgent] Back online, flushing queue');
      flushQueue();
    });
    updateQueueBadge();
    if (navigator.onLine) flushQueue();

    // Fetch config + load pins
    apiGet('/overlay/config')
      .then(function (c) {
        config = c;
        console.log('[FBAgent] Ready, project:', c.projectName);
        loadPins();
      })
      .catch(function (e) {
        console.error('[FBAgent] Config fetch failed:', e);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
