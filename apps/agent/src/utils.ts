export function timeAgo(dateStr: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function canonicalUrl(url: string): string {
  try { return url.split('#')[0].replace(/\/+$/, ''); } catch { return url; }
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const inp = document.createElement('input');
  inp.style.position = 'fixed';
  inp.style.opacity = '0';
  inp.value = text;
  document.body.appendChild(inp);
  inp.select();
  try { document.execCommand('copy'); } catch { /* ignore */ }
  document.body.removeChild(inp);
  return Promise.resolve();
}

export function getViewport(): 'desktop' | 'tablet' | 'mobile' {
  const w = window.innerWidth;
  return w >= 1024 ? 'desktop' : w >= 768 ? 'tablet' : 'mobile';
}

export function getEnvironment() {
  const ua = navigator.userAgent;
  const w = window.innerWidth;
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

export function getSelector(el: Element): string {
  if (!el || el === document.body || el === document.documentElement) return 'body';
  if (el.id) return '#' + CSS.escape(el.id);
  const parts: string[] = [];
  let current: Element | null = el;
  let depth = 0;
  while (current && current !== document.body && current !== document.documentElement && depth < 8) {
    let tag = current.tagName.toLowerCase();
    if (current.id) { parts.unshift('#' + CSS.escape(current.id)); break; }
    const par: Element | null = current.parentElement;
    if (par) {
      const siblings = Array.from(par.children as unknown as Element[]).filter((c) => c.tagName === current!.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        tag += ':nth-of-type(' + idx + ')';
      }
    }
    parts.unshift(tag);
    current = par;
    depth++;
  }
  const sel = parts.join(' > ');
  try { if (document.querySelector(sel) === el) return sel; } catch { /* invalid */ }
  return '';
}
