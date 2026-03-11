import { render } from 'preact';
import { initApi } from './api';
import App from './App';
import cssText from './styles.css?inline';

declare global {
  interface Window {
    __FB_AGENT_MOUNTED?: boolean;
  }
}

function mount() {
  if (window.__FB_AGENT_MOUNTED) return;
  window.__FB_AGENT_MOUNTED = true;

  // Find config from script tag — supports both old (data-key) and new (data-fb-key) formats
  const script = document.currentScript as HTMLScriptElement
    || document.querySelector('script[data-fb-key]')
    || document.querySelector('script[data-key]');

  if (!script) {
    console.warn('[FB Agent] No script tag found with data-key or data-fb-key');
    return;
  }

  const apiKey = script.getAttribute('data-fb-key') || script.getAttribute('data-key') || '';
  let apiBase = script.getAttribute('data-fb-api') || '';

  // Auto-derive API base from script src if not explicitly set
  if (!apiBase && script.src) {
    try {
      const u = new URL(script.src);
      apiBase = u.origin + '/api';
    } catch { /* ignore */ }
  }

  if (!apiKey) {
    console.warn('[FB Agent] Missing API key on script tag (data-key or data-fb-key)');
    return;
  }
  if (!apiBase) {
    console.warn('[FB Agent] Could not determine API base URL');
    return;
  }

  initApi(apiBase, apiKey);

  // Create host element
  const host = document.createElement('div');
  host.id = 'fb-agent-root';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  document.body.appendChild(host);

  // Attach shadow DOM
  const shadow = host.attachShadow({ mode: 'open' });

  // Inject compiled Tailwind CSS
  const style = document.createElement('style');
  style.textContent = cssText + `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; }
    .pointer-events-none { pointer-events: none; }
    [class*="pointer-events-auto"] { pointer-events: auto; }
  `;
  shadow.appendChild(style);

  // Create render target inside shadow
  const appRoot = document.createElement('div');
  appRoot.id = 'fb-agent-app';
  appRoot.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.5;color:#111827;';
  shadow.appendChild(appRoot);

  // Make toolbar and panel clickable
  const globalStyle = document.createElement('style');
  globalStyle.textContent = `
    #fb-agent-root { pointer-events: none; }
  `;
  document.head.appendChild(globalStyle);

  render(<App root={shadow} />, appRoot);

  console.log('[FB Agent] v2.0 mounted');
}

// Auto-mount when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
