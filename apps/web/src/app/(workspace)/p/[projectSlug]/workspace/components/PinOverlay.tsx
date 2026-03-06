'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { Thread } from '@/lib/api';
import { clamp, canonicalUrl } from '../lib/utils';
import PinMarker from './PinMarker';
import DraftPin from './DraftPin';
import type { StagedFile } from './Composer';
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
  projectId: string;
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

  /* ── Figma-style area interaction state ───────────────────
     Click = place pin. Drag = create area with handles.
     Active area persists with resize/position handles.
  ────────────────────────────────────────────────────── */
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [activeArea, setActiveArea] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [draggedHandle, setDraggedHandle] = useState<'resize' | 'position' | null>(null);
  const pointerDown = useRef(false);
  const DRAG_THRESHOLD = 2; // % distance to distinguish click from drag

  function getOverlayPct(e: React.MouseEvent) {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }

  // Click outside to deselect active area
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!pinMode) return;
      if (e.target !== overlayRef.current) return;
      if (draftPin) { onDraftCancel(); return; }
      if (activeArea) {
        setActiveArea(null);
        return;
      }
      // Pin/area placement is handled entirely via mousedown/mouseup
    },
    [pinMode, draftPin, onDraftCancel, activeArea]
  );

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!pinMode || draftPin) return;
    if (e.button !== 0) return;
    
    const target = e.target as HTMLElement;
    const rect = overlayRef.current!.getBoundingClientRect();
    const pos = getOverlayPct(e);
    
    // Check if clicking on area handles
    if (activeArea) {
      const handleSize = 12; // in pixels
      const handlePctX = (handleSize / rect.width) * 100;
      const handlePctY = (handleSize / rect.height) * 100;
      
      // Resize handle (bottom-right)
      if (pos.x >= activeArea.x2 - handlePctX && pos.x <= activeArea.x2 + handlePctX &&
          pos.y >= activeArea.y2 - handlePctY && pos.y <= activeArea.y2 + handlePctY) {
        e.preventDefault();
        setDraggedHandle('resize');
        setDragStart(pos);
        setDragCurrent(pos);
        pointerDown.current = true;
        return;
      }
      
      // Position handle (top-left)
      if (pos.x >= activeArea.x1 - handlePctX && pos.x <= activeArea.x1 + handlePctX &&
          pos.y >= activeArea.y1 - handlePctY && pos.y <= activeArea.y1 + handlePctY) {
        e.preventDefault();
        setDraggedHandle('position');
        setDragStart(pos);
        setDragCurrent(pos);
        pointerDown.current = true;
        return;
      }
      
      // Clicking inside area or outside -> deselect
      if (target === overlayRef.current) {
        setActiveArea(null);
        return;
      }
    }
    
    // Start new area drag
    if (target === overlayRef.current) {
      e.preventDefault();
      setDragStart(pos);
      setDragCurrent(pos);
      pointerDown.current = true;
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!pointerDown.current || !dragStart) return;
    const pos = getOverlayPct(e);
    
    if (draggedHandle === 'resize' && activeArea) {
      // Resize area from bottom-right
      setActiveArea({
        ...activeArea,
        x2: Math.max(activeArea.x1, pos.x),
        y2: Math.max(activeArea.y1, pos.y),
      });
    } else if (draggedHandle === 'position' && activeArea) {
      // Move entire area
      const dx = pos.x - (dragCurrent?.x || 0);
      const dy = pos.y - (dragCurrent?.y || 0);
      const width = activeArea.x2 - activeArea.x1;
      const height = activeArea.y2 - activeArea.y1;
      
      setActiveArea({
        x1: clamp(activeArea.x1 + dx, 0, 100 - width),
        y1: clamp(activeArea.y1 + dy, 0, 100 - height),
        x2: clamp(activeArea.x2 + dx, width, 100),
        y2: clamp(activeArea.y2 + dy, height, 100),
      });
      setDragCurrent(pos);
    } else {
      // New area drag
      setDragCurrent(pos);
    }
  }

  function handleMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    if (!pointerDown.current || !dragStart) return;
    pointerDown.current = false;
    
    if (draggedHandle) {
      // Finished dragging a handle
      setDraggedHandle(null);
      setDragStart(null);
      setDragCurrent(null);
      return;
    }
    
    // Finished new area drag
    const end = dragCurrent!;
    const w = Math.abs(end.x - dragStart.x);
    const h = Math.abs(end.y - dragStart.y);
    
    setDragStart(null);
    setDragCurrent(null);
    
    if (w < DRAG_THRESHOLD && h < DRAG_THRESHOLD) {
      // Click → place pin
      onOverlayClick(dragStart.x, dragStart.y);
    } else {
      // Drag → create area with handles
      setActiveArea({
        x1: Math.min(dragStart.x, end.x),
        y1: Math.min(dragStart.y, end.y),
        x2: Math.max(dragStart.x, end.x),
        y2: Math.max(dragStart.y, end.y),
      });
    }
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
        cursor: pinMode ? (draftPin ? 'default' : 'crosshair') : 'default',
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
          className={`absolute border pointer-events-auto cursor-pointer transition rounded-sm ${
            activeThreadId === t.id
              ? 'border-blue-500 bg-blue-500/8'
              : hoveredThreadId === t.id
                ? 'border-blue-400/70 bg-blue-400/5'
                : 'border-blue-300/40 hover:border-blue-400/60 hover:bg-blue-400/5'
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

      {/* Live area selection rectangle (only visible when dragging new area) */}
      {dragStart && dragCurrent && !draggedHandle && Math.abs(dragCurrent.x - dragStart.x) + Math.abs(dragCurrent.y - dragStart.y) > DRAG_THRESHOLD && (
        <div
          className="absolute border border-dashed border-blue-400/70 pointer-events-none z-[5] rounded-sm"
          style={{
            left: `${Math.min(dragStart.x, dragCurrent.x)}%`,
            top: `${Math.min(dragStart.y, dragCurrent.y)}%`,
            width: `${Math.abs(dragCurrent.x - dragStart.x)}%`,
            height: `${Math.abs(dragCurrent.y - dragStart.y)}%`,
          }}
        />
      )}

      {/* Active area with handles */}
      {activeArea && (
        <>
          {/* Area rectangle */}
          <div
            className="absolute border border-dashed border-blue-400/70 bg-blue-400/5 pointer-events-none z-[5] rounded-sm"
            style={{
              left: `${activeArea.x1}%`,
              top: `${activeArea.y1}%`,
              width: `${activeArea.x2 - activeArea.x1}%`,
              height: `${activeArea.y2 - activeArea.y1}%`,
            }}
          />
          
          {/* Create comment button (centered in area) */}
          <button
            className="absolute z-[75] px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 transition shadow-lg pointer-events-auto"
            style={{
              left: `${(activeArea.x1 + activeArea.x2) / 2}%`,
              top: `${(activeArea.y1 + activeArea.y2) / 2}%`,
              transform: 'translate(-50%, -50%)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onAreaSelect(activeArea.x1, activeArea.y1, activeArea.x2, activeArea.y2);
              setActiveArea(null);
            }}
          >
            Add comment
          </button>
          
          {/* Position handle (top-left) */}
          <div
            className="absolute z-[80] w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-move shadow-md"
            style={{
              left: `${activeArea.x1}%`,
              top: `${activeArea.y1}%`,
              transform: 'translate(-50%, -50%)',
            }}
            title="Drag to move area"
          />
          
          {/* Resize handle (bottom-right) */}
          <div
            className="absolute z-[80] w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-nwse-resize shadow-md"
            style={{
              left: `${activeArea.x2}%`,
              top: `${activeArea.y2}%`,
              transform: 'translate(-50%, -50%)',
            }}
            title="Drag to resize area"
          />
        </>
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
