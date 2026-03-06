import html2canvas from 'html2canvas';

/**
 * Capture a screenshot of the iframe's visible content.
 * Uses html2canvas on the iframe's document body (same-origin only).
 * Falls back gracefully if cross-origin or capture fails.
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
  try {
    const iframeDoc = iframeEl.contentDocument;
    if (!iframeDoc?.body) {
      console.warn('Screenshot: cannot access iframe document (cross-origin?)');
      return null;
    }

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
  } catch (err) {
    console.error('Screenshot capture failed:', err);
    return null;
  }
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
