import html2canvas from 'html2canvas';

/**
 * Capture a screenshot of the iframe's visible content.
 *
 * Strategy:
 *  1. Try direct html2canvas on iframe's document body (same-origin only).
 *  2. Fall back to bridge-based capture via postMessage — the overlay.js
 *     running inside the target page captures the screenshot and sends
 *     the result back as a base64 data URL.
 *
 * @param iframeEl  The iframe element to capture
 * @param pinXPct   Pin X position as percentage (0-100)
 * @param pinYPct   Pin Y position as percentage (0-100)
 * @returns Blob of the screenshot PNG, or null on failure
 */
export async function captureScreenshot(
  iframeEl: HTMLIFrameElement,
  pinXPct?: number,
  pinYPct?: number,
): Promise<Blob | null> {
  // Strategy 1: Direct DOM access (same-origin)
  const directResult = await captureDirectly(iframeEl, pinXPct, pinYPct);
  if (directResult) return directResult;

  // Strategy 2: Bridge-based capture (cross-origin with overlay.js)
  console.log('Screenshot: falling back to bridge capture');
  return capturViaBridge(iframeEl, pinXPct, pinYPct);
}

/** Same-origin capture using html2canvas on iframe document */
async function captureDirectly(
  iframeEl: HTMLIFrameElement,
  pinXPct?: number,
  pinYPct?: number,
): Promise<Blob | null> {
  try {
    const iframeDoc = iframeEl.contentDocument;
    if (!iframeDoc?.body) return null;

    const canvas = await html2canvas(iframeDoc.body, {
      useCORS: true,
      allowTaint: false,
      logging: false,
      scale: window.devicePixelRatio || 1,
      width: iframeEl.clientWidth,
      height: iframeEl.clientHeight,
      scrollX: -(iframeDoc.defaultView?.scrollX || 0),
      scrollY: -(iframeDoc.defaultView?.scrollY || 0),
      windowWidth: iframeEl.clientWidth,
      windowHeight: iframeEl.clientHeight,
    });

    // Draw pin marker on the screenshot
    if (pinXPct != null && pinYPct != null) {
      drawPinOnCanvas(canvas, pinXPct, pinYPct, iframeDoc);
    }

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 0.92);
    });
  } catch {
    return null;
  }
}

/** Cross-origin capture via overlay.js bridge postMessage */
function capturViaBridge(
  iframeEl: HTMLIFrameElement,
  pinXPct?: number,
  pinYPct?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const reqId = `ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      console.warn('Screenshot: bridge capture timed out');
      resolve(null);
    }, 8000);

    function handler(e: MessageEvent) {
      const d = e.data;
      if (!d || d.type !== 'FB_SCREENSHOT_RESULT' || d.reqId !== reqId) return;
      window.removeEventListener('message', handler);
      clearTimeout(timeout);

      if (d.error || !d.dataUrl) {
        console.warn('Screenshot: bridge capture failed:', d.error);
        resolve(null);
        return;
      }

      // Convert data URL to Blob
      try {
        const byteString = atob(d.dataUrl.split(',')[1]);
        const mimeString = d.dataUrl.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        resolve(new Blob([ab], { type: mimeString }));
      } catch (err) {
        console.error('Screenshot: failed to decode bridge result:', err);
        resolve(null);
      }
    }

    window.addEventListener('message', handler);

    // Send capture request to iframe bridge
    try {
      iframeEl.contentWindow?.postMessage(
        { type: 'FB_CAPTURE_SCREENSHOT', reqId, pinXPct, pinYPct },
        '*',
      );
    } catch {
      clearTimeout(timeout);
      window.removeEventListener('message', handler);
      resolve(null);
    }
  });
}

/**
 * Draw a teardrop pin marker on the canvas at the specified percentage position.
 * The pin is drawn relative to the visible viewport of the iframe.
 */
function drawPinOnCanvas(
  canvas: HTMLCanvasElement,
  xPct: number,
  yPct: number,
  iframeDoc: Document,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const scrollX = iframeDoc.defaultView?.scrollX || 0;
  const scrollY = iframeDoc.defaultView?.scrollY || 0;
  const docW = iframeDoc.documentElement.scrollWidth;
  const docH = iframeDoc.documentElement.scrollHeight;

  // Convert percentage position to pixel position on the canvas
  const absX = (xPct / 100) * docW - scrollX;
  const absY = (yPct / 100) * docH - scrollY;

  const scale = canvas.width / (canvas.width / (window.devicePixelRatio || 1));
  const cx = absX * (canvas.width / (canvas.width / scale));
  const cy = absY * (canvas.height / (canvas.height / scale));

  // Only draw if the pin is within the visible area
  if (cx < 0 || cx > canvas.width || cy < 0 || cy > canvas.height) return;

  const r = 12 * scale;

  // Draw teardrop shape
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(0, -r, r, Math.PI * 0.75, Math.PI * 2.25);
  ctx.lineTo(0, r * 0.4);
  ctx.closePath();

  // Fill and stroke
  ctx.fillStyle = '#f97316'; // orange-500
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2 * scale;
  ctx.stroke();

  // Inner dot
  ctx.beginPath();
  ctx.arc(0, -r, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.restore();
}

/**
 * Convert a Blob to a File object suitable for upload.
 */
export function screenshotBlobToFile(blob: Blob, threadTitle?: string): File {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `screenshot-${timestamp}.png`;
  return new File([blob], name, { type: 'image/png' });
}
