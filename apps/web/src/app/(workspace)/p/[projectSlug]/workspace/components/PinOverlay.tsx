'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { Thread } from '@/lib/api';
import { clamp, canonicalUrl } from '../lib/utils';
import PinMarker from './PinMarker';
import DraftPin from './DraftPin';
import type { StagedFile } from './Composer';
import { DraftPin as DraftPinType, Viewport, SelectionMode } from '../types';

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
  projectId: string;
  selectionMode: SelectionMode;
  onOverlayClick: (xPct: number, yPct: number) => void;
  onAreaSelect: (x1: number, y1: number, x2: number, y2: number) => void;
  onPinHoverEnter: (thread: Thread) => void;
  onPinHoverLeave: (thread: Thread) => void;
  onPinClick: (thread: Thread) => void;
  onPinDragEnd: (thread: Thread, xPct: number, yPct: number) => void;
  onPinDragStart: (thread: Thread) => void;
  onPanelHide: () => void;
  onPanelRestore: () => void;
  onDraftSubmit: (message: string, x: number, y: number, files: StagedFile[], mentionIds: string[]) => Promise<void>;
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
  projectId,
  selectionMode,
  onOverlayClick,
  onAreaSelect,
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

  /* ── Area selection state ──────────────────────────────────────── */
  const [areaStart, setAreaStart] = useState<{ x: number; y: number } | null>(null);
  const [areaCurrent, setAreaCurrent] = useState<{ x: number; y: number } | null>(null);
  const areaDrawing = useRef(false);

  function getOverlayPct(e: React.MouseEvent) {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }

  /* ── Click / mousedown handler for pin placement or area start ── */
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!pinMode) return;
      if (e.target !== overlayRef.current) return;
      if (draftPin) { onDraftCancel(); return; }
      if (selectionMode === 'area') return; // area handled via mousedown
      const rect = overlayRef.current!.getBoundingClientRect();
      const xPct = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
      const yPct = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
      onOverlayClick(xPct, yPct);
    },
    [pinMode, draftPin, onOverlayClick, onDraftCancel, selectionMode]
  );

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!pinMode || selectionMode !== 'area' || draftPin) return;
    if (e.target !== overlayRef.current) return;
    e.preventDefault();
    const pos = getOverlayPct(e);
    setAreaStart(pos);
    setAreaCurrent(pos);
    areaDrawing.current = true;
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!areaDrawing.current || !areaStart) return;
    setAreaCurrent(getOverlayPct(e));
  }

  function handleMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    if (!areaDrawing.current || !areaStart) return;
    areaDrawing.current = false;
    const end = getOverlayPct(e);
    setAreaStart(null);
    setAreaCurrent(null);
    // Minimum area threshold (prevent accidental tiny rectangles)
    const w = Math.abs(end.x - areaStart.x);
    const h = Math.abs(end.y - areaStart.y);
    if (w < 1 && h < 1) return;
    onAreaSelect(
      Math.min(areaStart.x, end.x),
      Math.min(areaStart.y, end.y),
      Math.max(areaStart.x, end.x),
      Math.max(areaStart.y, end.y),
    );
  }

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

  // Parse area anchors for existing threads
  const threadAreas = pinThreads
    .filter((t) => t.anchorData)
    .map((t) => {
      try {
        const anchor = typeof t.anchorData === 'string' ? JSON.parse(t.anchorData) : t.anchorData;
        if (anchor?.type === 'area') return { thread: t, ...anchor };
      } catch {}
      return null;
    })
    .filter(Boolean) as { thread: typeof pinThreads[0]; x1: number; y1: number; x2: number; y2: number }[];

  return (
    <div
      ref={overlayRef}
      className="absolute top-0 left-0 z-10"
      style={{
        width: '100%',
        height: docHeight > 0 ? docHeight : '100%',
        pointerEvents: (pinMode || panelHidden) ? 'auto' : 'none',
        cursor: pinMode ? (draftPin ? 'default' : (selectionMode === 'area' ? 'crosshair' : 'crosshair')) : 'default',
      }}
      onClick={handleOverlayClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Area highlights for existing threads */}
      {threadAreas.map(({ thread: t, x1, y1, x2, y2 }) => (
        <div
          key={`area-${t.id}`}
          className={`absolute border-2 pointer-events-auto cursor-pointer transition ${
            activeThreadId === t.id
              ? 'border-blue-500 bg-blue-500/10'
              : hoveredThreadId === t.id
                ? 'border-blue-400 bg-blue-400/8'
                : 'border-blue-300/50 bg-blue-300/5 hover:border-blue-400 hover:bg-blue-400/10'
          }`}
          style={{
            left: `${x1}%`,
            top: `${y1}%`,
            width: `${x2 - x1}%`,
            height: `${y2 - y1}%`,
          }}
          onClick={(e) => { e.stopPropagation(); onPinClick(t); }}
          onMouseEnter={() => onPinHoverEnter(t)}
          onMouseLeave={() => onPinHoverLeave(t)}
        />
      ))}

      {/* Live area selection rectangle */}
      {areaStart && areaCurrent && (
        <div
          className="absolute border-2 border-dashed border-orange-400 bg-orange-400/10 pointer-events-none z-[5]"
          style={{
            left: `${Math.min(areaStart.x, areaCurrent.x)}%`,
            top: `${Math.min(areaStart.y, areaCurrent.y)}%`,
            width: `${Math.abs(areaCurrent.x - areaStart.x)}%`,
            height: `${Math.abs(areaCurrent.y - areaStart.y)}%`,
          }}
        />
      )}

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
          projectId={projectId}
          overlayRect={overlayRect}
          onSubmit={onDraftSubmit}
          onCancel={onDraftCancel}
          area={draftPin.area}
        />
      )}
    </div>
  );
}
