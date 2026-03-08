'use client';

import { useRef, useState, useMemo } from 'react';
import { Thread } from '@/lib/api';
import { clamp } from '../lib/utils';
import { IconChat, IconCheck } from './Icons';

interface PinMarkerProps {
  thread: Thread;
  isActive: boolean;
  isHighlighted: boolean;
  isDragging?: boolean;
  overlayRect: DOMRect | null;
  onHoverEnter: (t: Thread) => void;
  onHoverLeave: (t: Thread) => void;
  onClick: (t: Thread) => void;
  onDragEnd: (thread: Thread, xPct: number, yPct: number) => void;
  onDragStart: () => void;
  onPanelHide: () => void;
  onPanelRestore: () => void;
  /** Called when secondary (X) point is dragged in edit mode */
  onSecondaryDragEnd?: (thread: Thread, sx: number, sy: number) => void;
}

type DragTarget = 'pin' | 'secondary';

export default function PinMarker({
  thread,
  isActive,
  isHighlighted,
  overlayRect,
  onHoverEnter,
  onHoverLeave,
  onClick,
  onDragEnd,
  onDragStart,
  onPanelHide,
  onPanelRestore,
  onSecondaryDragEnd,
}: PinMarkerProps) {
  // Parse secondary point from anchorData
  const anchorData = useMemo(() => {
    if (!thread.anchorData) return null;
    try {
      const d = typeof thread.anchorData === 'string' ? JSON.parse(thread.anchorData) : thread.anchorData;
      if (d?.type === 'area' && d.secondaryX != null && d.secondaryY != null) {
        return { secondaryX: d.secondaryX as number, secondaryY: d.secondaryY as number };
      }
    } catch {}
    return null;
  }, [thread.anchorData]);

  const [pos, setPos] = useState({ x: thread.xPct ?? 0, y: thread.yPct ?? 0 });
  const [sec, setSec] = useState<{ x: number; y: number } | null>(
    anchorData ? { x: anchorData.secondaryX, y: anchorData.secondaryY } : null
  );
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const dragState = useRef<{
    target: DragTarget;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    moved: boolean;
    panelHidden: boolean;
  } | null>(null);

  const hasArea = sec !== null;

  // Keep pos/sec in sync when thread prop changes (e.g. after reload)
  const prevThread = useRef(thread);
  if (
    prevThread.current.id !== thread.id ||
    (!dragging && (prevThread.current.xPct !== thread.xPct || prevThread.current.yPct !== thread.yPct))
  ) {
    prevThread.current = thread;
    setPos({ x: thread.xPct ?? 0, y: thread.yPct ?? 0 });
    if (anchorData) setSec({ x: anchorData.secondaryX, y: anchorData.secondaryY });
  }

  /* ── Pin (Y) pointer handlers ────────────────────────────── */
  function onPinPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      target: 'pin',
      startClientX: e.clientX, startClientY: e.clientY,
      startX: pos.x, startY: pos.y,
      moved: false, panelHidden: false,
    };
  }

  function onPinPointerMove(e: React.PointerEvent) {
    if (!dragState.current || dragState.current.target !== 'pin' || !overlayRect) return;
    const dx = (e.clientX - dragState.current.startClientX) / overlayRect.width * 100;
    const dy = (e.clientY - dragState.current.startClientY) / overlayRect.height * 100;
    const newX = clamp(dragState.current.startX + dx, 0, 100);
    const newY = clamp(dragState.current.startY + dy, 0, 100);
    if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
      if (!dragState.current.moved) {
        dragState.current.moved = true;
        setDragging(true);
        onDragStart();
        dragState.current.panelHidden = true;
        onPanelHide();
      }
      setPos({ x: newX, y: newY });
    }
  }

  function onPinPointerUp() {
    if (!dragState.current || dragState.current.target !== 'pin') return;
    const ds = dragState.current;
    dragState.current = null;
    setDragging(false);
    if (ds.panelHidden) onPanelRestore();
    if (!ds.moved) {
      onClick(thread);
      return;
    }
    onDragEnd(thread, pos.x, pos.y);
  }

  /* ── Secondary (X) pointer handlers (only in active/edit mode) ── */
  function onSecPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || !sec) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      target: 'secondary',
      startClientX: e.clientX, startClientY: e.clientY,
      startX: sec.x, startY: sec.y,
      moved: false, panelHidden: false,
    };
  }

  function onSecPointerMove(e: React.PointerEvent) {
    if (!dragState.current || dragState.current.target !== 'secondary' || !overlayRect) return;
    const dx = (e.clientX - dragState.current.startClientX) / overlayRect.width * 100;
    const dy = (e.clientY - dragState.current.startClientY) / overlayRect.height * 100;
    if (!dragState.current.moved && (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3)) {
      dragState.current.moved = true;
      setDragging(true);
    }
    if (dragState.current.moved) {
      setSec({
        x: clamp(dragState.current.startX + dx, 0, 100),
        y: clamp(dragState.current.startY + dy, 0, 100),
      });
    }
  }

  function onSecPointerUp() {
    if (!dragState.current || dragState.current.target !== 'secondary') return;
    const ds = dragState.current;
    dragState.current = null;
    setDragging(false);
    if (ds.moved && sec && onSecondaryDragEnd) {
      onSecondaryDragEnd(thread, sec.x, sec.y);
    }
  }

  /* ── Hover handlers ─────────────────────────────────────── */
  function handleMouseEnter() {
    if (dragging) return;
    setHovered(true);
    onHoverEnter(thread);
  }
  function handleMouseLeave() {
    if (dragging) return;
    setHovered(false);
    onHoverLeave(thread);
  }

  /* ── Render helpers ─────────────────────────────────────── */
  const resolved = thread.status === 'resolved';
  // Show area: muted on hover, full on active
  const showArea = hasArea && (hovered || isActive || isHighlighted);
  const areaOpacity = isActive ? 1 : 0.45;

  // Area rectangle between pin (Y) and secondary (X)
  const areaRect = (hasArea && sec) ? {
    left: `${Math.min(pos.x, sec.x)}%`,
    top: `${Math.min(pos.y, sec.y)}%`,
    width: `${Math.abs(pos.x - sec.x)}%`,
    height: `${Math.abs(pos.y - sec.y)}%`,
  } : null;

  return (
    <>
      {/* ── Area rectangle (hover=muted, active=full) ── */}
      {showArea && areaRect && (
        <div
          className="absolute pointer-events-none rounded-sm border border-dashed transition-opacity duration-200"
          style={{
            ...areaRect,
            borderColor: `rgba(59,130,246,${areaOpacity * 0.7})`,
            backgroundColor: `rgba(59,130,246,${areaOpacity * 0.06})`,
            zIndex: isActive ? 28 : 18,
          }}
        />
      )}

      {/* ── Secondary dot (X) — hover=muted, active=draggable ── */}
      {showArea && sec && (
        <div
          className={`absolute flex items-center justify-center rounded-full border-2 transition-opacity duration-200 ${
            isActive
              ? 'h-3.5 w-3.5 border-blue-500 bg-white shadow-md cursor-grab active:cursor-grabbing hover:bg-blue-50'
              : 'h-2.5 w-2.5 border-blue-400/60 bg-white/80'
          }`}
          style={{
            left: `${sec.x}%`,
            top: `${sec.y}%`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: isActive ? 'auto' : 'none',
            opacity: areaOpacity,
            zIndex: isActive ? 32 : 19,
          }}
          onPointerDown={isActive ? onSecPointerDown : undefined}
          onPointerMove={isActive ? onSecPointerMove : undefined}
          onPointerUp={isActive ? onSecPointerUp : undefined}
        />
      )}

      {/* ── Pin (Y) — always visible ── */}
      <div
        className={`absolute select-none ${isActive ? 'z-30' : 'z-20'}`}
        style={{
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          transform: 'translate(-50%, -100%)',
          pointerEvents: 'auto',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
        onPointerDown={onPinPointerDown}
        onPointerMove={onPinPointerMove}
        onPointerUp={onPinPointerUp}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-thread-id={thread.id}
      >
        <div
          className={`relative flex h-7 w-7 items-center justify-center shadow-lg transition-all duration-200 ${
            resolved ? 'bg-green-600 opacity-60' : 'bg-blue-700'
          } ${isActive || isHighlighted ? 'ring-2 ring-blue-400/70 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'hover:scale-110'}`}
          style={{ borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' }}
        >
          <span className="text-white" style={{ transform: 'rotate(45deg)', display: 'flex' }}>
            <IconChat />
          </span>
          {resolved && (
            <span
              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-600 text-white shadow"
              style={{ transform: 'rotate(45deg)' }}
            >
              <span style={{ transform: 'rotate(-45deg)', display: 'flex' }}>
                <IconCheck />
              </span>
            </span>
          )}
        </div>
      </div>
    </>
  );
}

export type { PinMarkerProps };
