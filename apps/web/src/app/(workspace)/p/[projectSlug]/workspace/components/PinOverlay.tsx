'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { Thread } from '@/lib/api';
import { clamp, canonicalUrl } from '../lib/utils';
import PinMarker from './PinMarker';
import DraftPin from './DraftPin';
import { DraftPin as DraftPinType, Viewport } from '../types';

interface PinOverlayProps {
  threads: Thread[];
  activeThreadId: string | null;
  hoveredThreadId: string | null;
  draftPin: DraftPinType | null;
  pinMode: boolean;
  panelHidden: boolean;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  currentPageUrl: string;
  viewport: Viewport;
  onOverlayClick: (xPct: number, yPct: number) => void;
  onPinHoverEnter: (thread: Thread) => void;
  onPinHoverLeave: (thread: Thread) => void;
  onPinClick: (thread: Thread) => void;
  onPinDragEnd: (thread: Thread, xPct: number, yPct: number) => void;
  onPinDragStart: (thread: Thread) => void;
  onPanelHide: () => void;
  onPanelRestore: () => void;
  onDraftSubmit: (message: string, x: number, y: number) => Promise<void>;
  onDraftCancel: () => void;
}

export default function PinOverlay({
  threads,
  activeThreadId,
  hoveredThreadId,
  draftPin,
  pinMode,
  panelHidden,
  iframeRef,
  currentPageUrl,
  viewport,
  onOverlayClick,
  onPinHoverEnter,
  onPinHoverLeave,
  onPinClick,
  onPinDragEnd,
  onPinDragStart,
  onPanelHide,
  onPanelRestore,
  onDraftSubmit,
  onDraftCancel,
}: PinOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [docHeight, setDocHeight] = useState(0);

  // Tracked scroll state (updated by bridge OR direct DOM access)
  const scrollYRef = useRef(0);
  const vpHeightRef = useRef(0);
  const docHeightRef = useRef(0);
  const bridgeActive = useRef(false);

  // Apply transform helper — updates overlay position immediately
  function applyTransform(sy: number) {
    const overlay = overlayRef.current;
    if (overlay) overlay.style.transform = `translateY(${-sy}px)`;
  }

  /* ── Bridge message listener (cross-origin + same-origin) ──────
     Listens for FB_SCROLL / FB_RESIZE / FB_READY from the bridge
     script (overlay.js) running inside the iframe. This is the
     primary data source — works even for cross-origin iframes.
     Mirrors WPF plugin's handleIframeMessage pattern.
  ──────────────────────────────────────────────────────────────── */
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data;
      if (!d || typeof d.type !== 'string' || !d.type.startsWith('FB_')) return;

      switch (d.type) {
        case 'FB_READY':
        case 'FB_RESIZE':
          bridgeActive.current = true;
          if (d.docHeight > 0) {
            docHeightRef.current = d.docHeight;
            setDocHeight(d.docHeight);
          }
          if (d.vpHeight > 0) vpHeightRef.current = d.vpHeight;
          if (d.scrollY != null) {
            scrollYRef.current = d.scrollY;
            applyTransform(d.scrollY);
          }
          break;
        case 'FB_SCROLL':
          bridgeActive.current = true;
          scrollYRef.current = d.scrollY ?? 0;
          applyTransform(scrollYRef.current);
          break;
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  /* ── Send FB_INIT handshake to iframe ──────────────────────────
     Asks the bridge script to send FB_READY. Retried on iframe load.
  ──────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    function sendInit() {
      try { iframe!.contentWindow?.postMessage({ type: 'FB_INIT' }, '*'); } catch {}
    }

    function onLoad() { sendInit(); setTimeout(sendInit, 300); }

    iframe.addEventListener('load', onLoad);
    sendInit();
    const retry = setTimeout(sendInit, 1000);

    return () => {
      iframe.removeEventListener('load', onLoad);
      clearTimeout(retry);
    };
  }, [iframeRef]);

  /* ── RAF poll fallback (same-origin without bridge) ────────────
     If the bridge is not active (overlay.js not installed on target),
     falls back to direct DOM access for same-origin iframes.
  ──────────────────────────────────────────────────────────────── */
  useEffect(() => {
    let raf: number;
    let lastDocH = 0;

    function poll() {
      if (!bridgeActive.current) {
        const iframe = iframeRef.current;
        const overlay = overlayRef.current;
        if (iframe && overlay) {
          try {
            const win = iframe.contentWindow;
            const doc = iframe.contentDocument;
            if (win && doc && doc.documentElement) {
              scrollYRef.current = win.scrollY;
              vpHeightRef.current = win.innerHeight;
              overlay.style.transform = `translateY(${-win.scrollY}px)`;
              const docH = doc.documentElement.scrollHeight;
              if (docH > 0 && docH !== lastDocH) {
                lastDocH = docH;
                docHeightRef.current = docH;
                setDocHeight(docH);
              }
            }
          } catch { /* cross-origin without bridge — can't sync */ }
        }
      }
      raf = requestAnimationFrame(poll);
    }

    poll();
    return () => cancelAnimationFrame(raf);
  }, [iframeRef]);

  /* ── Wheel + touch event forwarding ────────────────────────────
     WPF pattern: update local scrollY optimistically, apply transform
     immediately, then tell iframe to scroll (postMessage or scrollBy).
     All listeners passive — never blocks scroll. No pointer-events hack.
  ──────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;

    function scrollIframe(deltaX: number, deltaY: number) {
      const iframe = iframeRef.current;
      if (!iframe) return;

      // Update local tracking (WPF iframeScrollY pattern)
      const maxScroll = Math.max(0, docHeightRef.current - vpHeightRef.current);
      scrollYRef.current = Math.max(0, Math.min(scrollYRef.current + deltaY, maxScroll));
      applyTransform(scrollYRef.current);

      if (bridgeActive.current) {
        // Bridge: send absolute scroll position (like WPF SCROLL_TO)
        try {
          iframe.contentWindow?.postMessage({
            type: 'FB_SCROLL_TO',
            x: 0,
            y: scrollYRef.current,
          }, '*');
        } catch {}
      } else {
        // Direct: try scrollBy (same-origin only)
        try {
          iframe.contentWindow?.scrollBy(deltaX, deltaY);
        } catch {}
      }
    }

    function onWheel(e: WheelEvent) {
      scrollIframe(e.deltaX, e.deltaY);
    }

    let touchX = 0, touchY = 0;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 1) {
        touchX = e.touches[0].clientX;
        touchY = e.touches[0].clientY;
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const dx = touchX - e.touches[0].clientX;
      const dy = touchY - e.touches[0].clientY;
      touchX = e.touches[0].clientX;
      touchY = e.touches[0].clientY;
      scrollIframe(dx, dy);
    }

    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [iframeRef]);

  /* ── Click handler for pin placement ─────────────────────────── */
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!pinMode) return;
      if (e.target !== overlayRef.current) return;
      if (draftPin) { onDraftCancel(); return; }
      const rect = overlayRef.current!.getBoundingClientRect();
      // getBoundingClientRect() includes the translateY transform,
      // so (clientY - rect.top) / rect.height gives document-relative %.
      const xPct = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
      const yPct = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
      onOverlayClick(xPct, yPct);
    },
    [pinMode, draftPin, onOverlayClick, onDraftCancel]
  );

  const overlayRect = overlayRef.current?.getBoundingClientRect() ?? null;

  // Filter pins by current page URL AND viewport (matches WPF renderPins double-filter)
  const pinThreads = threads.filter((t) => {
    if (t.contextType !== 'pin' || t.xPct == null || t.yPct == null) return false;
    // Viewport filter — WPF checks (t.viewport || 'desktop') !== viewportFilter
    if ((t.viewport || 'desktop') !== viewport) return false;
    if (!currentPageUrl) return true; // URL not yet known — show all
    const threadUrl = canonicalUrl(t.pageUrl || '');
    return threadUrl === currentPageUrl;
  });

  return (
    <div
      ref={overlayRef}
      className="absolute top-0 left-0 z-10"
      style={{
        width: '100%',
        height: docHeight > 0 ? docHeight : '100%',
        pointerEvents: (pinMode || panelHidden) ? 'auto' : 'none',
        cursor: pinMode ? (draftPin ? 'default' : 'crosshair') : 'default',
      }}
      onClick={handleOverlayClick}
    >
      {/* Existing pin markers */}
      {pinThreads.map((t) => (
        <PinMarker
          key={t.id}
          thread={t}
          isActive={activeThreadId === t.id}
          isHighlighted={hoveredThreadId === t.id}
          overlayRect={overlayRect}
          onHoverEnter={onPinHoverEnter}
          onHoverLeave={onPinHoverLeave}
          onClick={onPinClick}
          onDragEnd={onPinDragEnd}
          onDragStart={() => onPinDragStart(t)}
          onPanelHide={onPanelHide}
          onPanelRestore={onPanelRestore}
        />
      ))}

      {/* Draft pin + composer */}
      {draftPin && (
        <DraftPin
          x={draftPin.x}
          y={draftPin.y}
          overlayRect={overlayRect}
          onSubmit={onDraftSubmit}
          onCancel={onDraftCancel}
        />
      )}
    </div>
  );
}
