/**
 * useBridge — Single source of truth for iframe ↔ parent bridge communication.
 *
 * Architecture (industry pattern from BugHerd / Marker.io / MarkUp.io):
 *   overlay.js (in iframe)  ──postMessage──▶  useBridge (parent)
 *                           ◀──postMessage──
 *
 * Protocol:
 *   Bridge → Parent:
 *     FB_READY       { pageUrl, pageTitle, docHeight, vpHeight, scrollY, scrollX }
 *     FB_NAVIGATED   { pageUrl, pageTitle }
 *     FB_SCROLL      { scrollX, scrollY }
 *     FB_RESIZE      { docWidth, docHeight, vpWidth, vpHeight }
 *     FB_KEY_DOWN    { key }
 *     FB_FOCUS       (iframe received focus)
 *     FB_PONG        (heartbeat response)
 *
 *   Parent → Bridge:
 *     FB_INIT              (request handshake / re-send READY)
 *     FB_PING              (heartbeat)
 *     FB_SCROLL_TO         { x, y }
 *     FB_CAPTURE_SCREENSHOT { reqId, pinXPct?, pinYPct? }
 *
 * Design decisions:
 *   1. ONE message listener — no duplicates across components
 *   2. URL state in React (triggers re-renders for pin filtering)
 *   3. Scroll/dimension data in refs (no re-renders, direct DOM for performance)
 *   4. Overlay element registered via callback for direct transform updates
 *   5. Keyboard events dispatched to window (focus-agnostic)
 *   6. Heartbeat every 5s to detect bridge disconnection
 */
import { useEffect, useState, useRef, useCallback, type MutableRefObject } from 'react';
import { canonicalUrl } from '../lib/utils';

/* ── Public interface ─────────────────────────────────────────────── */

export interface UseBridgeReturn {
  /** Canonical URL of current iframe page (React state — triggers re-renders) */
  currentPageUrl: string;
  /** Whether bridge has responded at least once */
  connected: boolean;
  /** Document height for overlay sizing (React state) */
  docHeight: number;
  /** Real-time refs (no re-renders — use for scroll sync & dimension checks) */
  scrollYRef: MutableRefObject<number>;
  docHeightRef: MutableRefObject<number>;
  vpHeightRef: MutableRefObject<number>;
  bridgeActiveRef: MutableRefObject<boolean>;
  /** Register the pin overlay element for direct scroll transform updates */
  setOverlayElement: (el: HTMLDivElement | null) => void;
  /** Scroll the iframe to absolute position */
  scrollIframeTo: (x: number, y: number) => void;
  /** Scroll the iframe by delta (for wheel/touch forwarding) */
  scrollIframeBy: (deltaY: number) => void;
  /** Request screenshot capture inside the iframe */
  requestScreenshot: (reqId: string, pinXPct?: number, pinYPct?: number) => void;
}

/* ── Hook ─────────────────────────────────────────────────────────── */

export function useBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  baseUrl: string | undefined,
  onTogglePinMode: () => void,
): UseBridgeReturn {
  /* ── React state (triggers re-renders) ──────────────────────────── */
  const [currentPageUrl, setCurrentPageUrl] = useState('');
  const [connected, setConnected] = useState(false);
  const [docHeight, setDocHeight] = useState(0);

  /* ── Refs (no re-renders — performance-critical) ────────────────── */
  const scrollYRef = useRef(0);
  const docHeightRef = useRef(0);
  const vpHeightRef = useRef(0);
  const bridgeActiveRef = useRef(false);
  const overlayElRef = useRef<HTMLDivElement | null>(null);

  // Stable refs for callbacks to avoid effect re-runs
  const onTogglePinModeRef = useRef(onTogglePinMode);
  onTogglePinModeRef.current = onTogglePinMode;

  /* ── Set initial page URL from project baseUrl ──────────────────── */
  useEffect(() => {
    if (baseUrl) setCurrentPageUrl(canonicalUrl(baseUrl));
  }, [baseUrl]);

  /* ── Register overlay element for scroll transforms ─────────────── */
  const setOverlayElement = useCallback((el: HTMLDivElement | null) => {
    overlayElRef.current = el;
  }, []);

  /* ── Apply scroll transform (direct DOM — no React) ─────────────── */
  function applyScrollTransform(sy: number) {
    if (overlayElRef.current) {
      overlayElRef.current.style.transform = `translateY(${-sy}px)`;
    }
  }

  /* ── Main effect: message listener + init probing + heartbeat ───── */
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !baseUrl) return;

    let loadTimers: ReturnType<typeof setTimeout>[] = [];

    // ── Send command to iframe ──
    function send(data: Record<string, unknown>) {
      try { iframe!.contentWindow?.postMessage(data, '*'); } catch { /* cross-origin ok */ }
    }

    // ── Bridge message handler (SINGLE listener for everything) ──
    function handleMessage(e: MessageEvent) {
      const d = e.data;
      if (!d || typeof d.type !== 'string' || !d.type.startsWith('FB_')) return;

      switch (d.type) {
        case 'FB_READY': {
          console.log('[useBridge] FB_READY received', { pageUrl: d.pageUrl, pageTitle: d.pageTitle });
          bridgeActiveRef.current = true;
          setConnected(true);
          if (d.pageUrl) {
            const url = canonicalUrl(d.pageUrl);
            setCurrentPageUrl((prev) => {
              if (prev !== url) console.log('[useBridge] URL updated', { from: prev, to: url });
              return url;
            });
          }
          if (d.docHeight > 0) { docHeightRef.current = d.docHeight; setDocHeight(d.docHeight); }
          if (d.vpHeight > 0) vpHeightRef.current = d.vpHeight;
          if (d.scrollY != null) { scrollYRef.current = d.scrollY; applyScrollTransform(d.scrollY); }
          break;
        }

        case 'FB_NAVIGATED': {
          console.log('[useBridge] FB_NAVIGATED received', { pageUrl: d.pageUrl });
          bridgeActiveRef.current = true;
          if (d.pageUrl) {
            const url = canonicalUrl(d.pageUrl);
            setCurrentPageUrl((prev) => {
              if (prev !== url) console.log('[useBridge] URL updated (nav)', { from: prev, to: url });
              return url;
            });
          }
          break;
        }

        case 'FB_SCROLL': {
          bridgeActiveRef.current = true;
          scrollYRef.current = d.scrollY ?? 0;
          applyScrollTransform(scrollYRef.current);
          break;
        }

        case 'FB_RESIZE': {
          bridgeActiveRef.current = true;
          if (d.docHeight > 0) { docHeightRef.current = d.docHeight; setDocHeight(d.docHeight); }
          if (d.vpHeight > 0) vpHeightRef.current = d.vpHeight;
          break;
        }

        case 'FB_KEY_DOWN': {
          window.focus();
          if (d.key === 'i' || d.key === 'I') {
            onTogglePinModeRef.current();
          }
          if (d.key === 'Escape') {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          }
          break;
        }

        case 'FB_FOCUS': {
          // Iframe got focus — bridge is alive
          bridgeActiveRef.current = true;
          break;
        }

        case 'FB_PONG': {
          bridgeActiveRef.current = true;
          setConnected(true);
          break;
        }

        case 'FB_SCREENSHOT_RESULT': {
          // Handled by screenshot capture system (via custom event)
          window.dispatchEvent(new CustomEvent('fb-screenshot-result', { detail: d }));
          break;
        }
      }
    }

    window.addEventListener('message', handleMessage);

    // ── Iframe load → probe bridge ──
    function onIframeLoad() {
      console.log('[useBridge] iframe.load fired — probing bridge');
      bridgeActiveRef.current = false;
      setConnected(false);
      // Clear old timers
      loadTimers.forEach(clearTimeout);
      loadTimers = [];
      // Aggressive INIT retries (bridge script may load after DOMContentLoaded)
      [0, 150, 400, 800, 1500, 3000].forEach((ms) => {
        loadTimers.push(setTimeout(() => send({ type: 'FB_INIT' }), ms));
      });
    }

    iframe.addEventListener('load', onIframeLoad);

    // ── Initial probe ──
    send({ type: 'FB_INIT' });

    // ── Heartbeat: ping every 5s ──
    const heartbeat = setInterval(() => send({ type: 'FB_PING' }), 5000);

    // ── Same-origin fallback: poll URL + dimensions directly ──
    const sameFallback = setInterval(() => {
      if (bridgeActiveRef.current) return; // Bridge handles it
      try {
        const href = iframe.contentWindow?.location.href;
        if (href && href !== 'about:blank') {
          const url = canonicalUrl(href);
          setCurrentPageUrl((prev) => prev !== url ? url : prev);
        }
        const doc = iframe.contentDocument;
        if (doc?.documentElement) {
          const h = doc.documentElement.scrollHeight;
          if (h > 0 && h !== docHeightRef.current) {
            docHeightRef.current = h;
            setDocHeight(h);
          }
          scrollYRef.current = iframe.contentWindow?.scrollY ?? 0;
          applyScrollTransform(scrollYRef.current);
          vpHeightRef.current = iframe.contentWindow?.innerHeight ?? 0;
        }
      } catch { /* cross-origin — no fallback available, bridge required */ }
    }, 500);

    // ── Focus management: re-probe bridge when parent loses focus ──
    function onWindowBlur() {
      if (bridgeActiveRef.current) send({ type: 'FB_INIT' });
    }
    window.addEventListener('blur', onWindowBlur);

    // ── Cleanup ──
    return () => {
      window.removeEventListener('message', handleMessage);
      iframe.removeEventListener('load', onIframeLoad);
      window.removeEventListener('blur', onWindowBlur);
      clearInterval(heartbeat);
      clearInterval(sameFallback);
      loadTimers.forEach(clearTimeout);
    };
  }, [iframeRef, baseUrl]); // Stable deps only — callbacks via refs

  /* ── Commands → iframe ──────────────────────────────────────────── */

  const scrollIframeTo = useCallback((x: number, y: number) => {
    try {
      iframeRef.current?.contentWindow?.postMessage({ type: 'FB_SCROLL_TO', x, y }, '*');
    } catch { /* ignore */ }
  }, [iframeRef]);

  const scrollIframeBy = useCallback((deltaY: number) => {
    const maxScroll = Math.max(0, docHeightRef.current - vpHeightRef.current);
    scrollYRef.current = Math.max(0, Math.min(scrollYRef.current + deltaY, maxScroll));
    applyScrollTransform(scrollYRef.current);

    if (bridgeActiveRef.current) {
      try {
        iframeRef.current?.contentWindow?.postMessage({
          type: 'FB_SCROLL_TO', x: 0, y: scrollYRef.current,
        }, '*');
      } catch { /* ignore */ }
    } else {
      try { iframeRef.current?.contentWindow?.scrollBy(0, deltaY); } catch { /* cross-origin */ }
    }
  }, [iframeRef]);

  const requestScreenshot = useCallback((reqId: string, pinXPct?: number, pinYPct?: number) => {
    try {
      iframeRef.current?.contentWindow?.postMessage({
        type: 'FB_CAPTURE_SCREENSHOT', reqId, pinXPct, pinYPct,
      }, '*');
    } catch { /* ignore */ }
  }, [iframeRef]);

  return {
    currentPageUrl,
    connected,
    docHeight,
    scrollYRef,
    docHeightRef,
    vpHeightRef,
    bridgeActiveRef,
    setOverlayElement,
    scrollIframeTo,
    scrollIframeBy,
    requestScreenshot,
  };
}
