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
