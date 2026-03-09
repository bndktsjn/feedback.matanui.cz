'use client';

import { useRef, useCallback, useEffect, useState, type MutableRefObject } from 'react';
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
  setOverlayElement: (el: HTMLDivElement | null) => void;
  docHeight: number;
  scrollIframeBy: (deltaY: number) => void;
  bridgeActiveRef: MutableRefObject<boolean>;
  currentPageUrl: string;
  viewport: Viewport;
  projectId: string;
  onOverlayClick: (pinX: number, pinY: number) => void;
  onAreaSelect: (secondaryX: number, secondaryY: number, pinX: number, pinY: number) => void;
  onPinHoverEnter: (thread: Thread) => void;
  onPinHoverLeave: (thread: Thread) => void;
  onPinClick: (thread: Thread) => void;
  onPinDragEnd: (thread: Thread, xPct: number, yPct: number) => void;
  onPinDragStart: (thread: Thread) => void;
  onPanelHide: () => void;
  onPanelRestore: () => void;
  onDraftSubmit: (message: string, pinX: number, pinY: number, files: StagedFile[], mentionIds: string[], secondary?: { x: number; y: number }) => Promise<void>;
  onDraftCancel: () => void;
  onSecondaryDragEnd?: (thread: Thread, sx: number, sy: number) => void;
}

export default function PinOverlay({
  threads,
  activeThreadId,
  hoveredThreadId,
  draftPin,
  pinMode,
  panelHidden,
  setOverlayElement,
  docHeight,
  scrollIframeBy,
  bridgeActiveRef,
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
  onSecondaryDragEnd,
}: PinOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Register overlay element with bridge for direct scroll transforms
  const setRef = useCallback((el: HTMLDivElement | null) => {
    overlayRef.current = el;
    setOverlayElement(el);
  }, [setOverlayElement]);

  /* ── Wheel + touch → scroll iframe via bridge ──────────────────
     Passive listeners forward scroll deltas through useBridge.
     The bridge updates the overlay transform directly (no React).
  ──────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      scrollIframeBy(e.deltaY);
    }

    let touchY = 0;
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 1) touchY = e.touches[0].clientY;
    }
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const dy = touchY - e.touches[0].clientY;
      touchY = e.touches[0].clientY;
      scrollIframeBy(dy);
    }

    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [scrollIframeBy]);

  /* ── Unified click / drag state (Figma-style) ───────────────
     Click = place a pin. Drag = create an area.
     Decision made on mouseup based on distance.
  ────────────────────────────────────────────────────── */
  const [areaStart, setAreaStart] = useState<{ x: number; y: number } | null>(null);
  const [areaCurrent, setAreaCurrent] = useState<{ x: number; y: number } | null>(null);
  const pointerDown = useRef(false);
  const justPlaced = useRef(false); // prevents click handler from cancelling a just-created pin
  const DRAG_THRESHOLD = 2; // % distance to distinguish click from drag

  function getOverlayPct(e: React.MouseEvent) {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }

  // We intercept click only to cancel draft pin on outside click
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!pinMode) return;
      if (e.target !== overlayRef.current) return;
      // Skip if we just placed a pin/area via mouseup (same event cycle)
      if (justPlaced.current) { justPlaced.current = false; return; }
      if (draftPin) { onDraftCancel(); return; }
    },
    [pinMode, draftPin, onDraftCancel]
  );

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!pinMode || draftPin) return;
    if (e.target !== overlayRef.current) return;
    if (e.button !== 0) return;
    e.preventDefault();
    const pos = getOverlayPct(e);
    setAreaStart(pos);
    setAreaCurrent(pos);
    pointerDown.current = true;
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!pointerDown.current || !areaStart) return;
    setAreaCurrent(getOverlayPct(e));
  }

  function handleMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    if (!pointerDown.current || !areaStart) return;
    pointerDown.current = false;
    const end = getOverlayPct(e);
    setAreaStart(null);
    setAreaCurrent(null);

    const w = Math.abs(end.x - areaStart.x);
    const h = Math.abs(end.y - areaStart.y);

    // Mark that we just placed — prevents the subsequent click event from cancelling
    justPlaced.current = true;

    if (w < DRAG_THRESHOLD && h < DRAG_THRESHOLD) {
      // Small movement → treat as a point-click pin at release point
      onOverlayClick(end.x, end.y);
    } else {
      // Significant drag → area: start = secondary (X), end = pin (Y)
      onAreaSelect(areaStart.x, areaStart.y, end.x, end.y);
    }
  }

  const overlayRect = overlayRef.current?.getBoundingClientRect() ?? null;

  // Filter pins by current page URL AND viewport (matches WPF renderPins double-filter)
  const pinThreads = threads.filter((t) => {
    if (t.contextType !== 'pin' || t.xPct == null || t.yPct == null) return false;
    if ((t.viewport || 'desktop') !== viewport) return false;
    if (!currentPageUrl) return false;
    const threadUrl = canonicalUrl(t.pageUrl || '');
    return threadUrl === currentPageUrl;
  });

  // Debug: log pin filtering on every render (helps trace stale pin issues)
  if (threads.length > 0) {
    const pinCandidates = threads.filter(t => t.contextType === 'pin' && t.xPct != null && t.yPct != null);
    if (pinCandidates.length !== pinThreads.length) {
      console.log('[PinOverlay] Pin filter:', {
        currentPageUrl,
        viewport,
        totalPins: pinCandidates.length,
        visiblePins: pinThreads.length,
        urls: [...new Set(pinCandidates.map(t => canonicalUrl(t.pageUrl || '')))],
      });
    }
  }

  return (
    <div
      ref={setRef}
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
      {/* Live area selection rectangle (only visible when dragging) */}
      {areaStart && areaCurrent && Math.abs(areaCurrent.x - areaStart.x) + Math.abs(areaCurrent.y - areaStart.y) > DRAG_THRESHOLD && (
        <div
          className="absolute border border-dashed border-blue-400/70 pointer-events-none z-[5] rounded-sm"
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
          onSecondaryDragEnd={onSecondaryDragEnd}
        />
      ))}

      {/* Draft pin + composer */}
      {draftPin && (
        <DraftPin
          pinX={draftPin.pinX}
          pinY={draftPin.pinY}
          secondary={draftPin.secondary}
          projectId={projectId}
          overlayRect={overlayRect}
          onSubmit={onDraftSubmit}
          onCancel={onDraftCancel}
        />
      )}
    </div>
  );
}
