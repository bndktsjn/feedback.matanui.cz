'use client';

import { useRef, useState } from 'react';
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
}

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
}: PinMarkerProps) {
  const [pos, setPos] = useState({ x: thread.xPct ?? 0, y: thread.yPct ?? 0 });
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    moved: boolean;
    panelHidden: boolean;
  } | null>(null);

  // Keep pos in sync when thread prop changes (e.g. after reload)
  // but not while dragging
  const prevThread = useRef(thread);
  if (
    prevThread.current.id !== thread.id ||
    (!dragging && (prevThread.current.xPct !== thread.xPct || prevThread.current.yPct !== thread.yPct))
  ) {
    prevThread.current = thread;
    setPos({ x: thread.xPct ?? 0, y: thread.yPct ?? 0 });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: pos.x,
      startY: pos.y,
      moved: false,
      panelHidden: false,
    };
    // Don't call onDragStart or setDragging yet — wait for actual movement.
    // This prevents closing an open popover on a simple click.
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current || !overlayRect) return;
    const dx = (e.clientX - dragState.current.startClientX) / overlayRect.width * 100;
    const dy = (e.clientY - dragState.current.startClientY) / overlayRect.height * 100;
    const newX = clamp(dragState.current.startX + dx, 0, 100);
    const newY = clamp(dragState.current.startY + dy, 0, 100);
    if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
      if (!dragState.current.moved) {
        dragState.current.moved = true;
        setDragging(true);
        onDragStart(); // only now — actual drag started
        dragState.current.panelHidden = true;
        onPanelHide();
      }
      setPos({ x: newX, y: newY });
    }
  }

  function onPointerUp() {
    if (!dragState.current) return;
    const ds = dragState.current;
    dragState.current = null;
    setDragging(false);
    if (ds.panelHidden) onPanelRestore();
    if (!ds.moved) {
      // It was a click, not a drag — toggle popover
      onClick(thread);
      return;
    }
    onDragEnd(thread, pos.x, pos.y);
  }

  const resolved = thread.status === 'resolved';

  return (
    <div
      className={`absolute z-20 select-none ${isActive ? 'z-30' : ''}`}
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: 'translate(-50%, -100%)',
        pointerEvents: 'auto',
        cursor: dragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onMouseEnter={() => !dragging && onHoverEnter(thread)}
      onMouseLeave={() => !dragging && onHoverLeave(thread)}
      data-thread-id={thread.id}
    >
      {/* Teardrop marker */}
      <div
        className={`relative flex h-7 w-7 items-center justify-center shadow-lg transition-all duration-200 ${
          resolved ? 'bg-green-600 opacity-60' : 'bg-blue-700'
        } ${isActive || isHighlighted ? 'ring-2 ring-blue-400/70 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'hover:scale-110'}`}
        style={{ borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' }}
      >
        <span className="text-white" style={{ transform: 'rotate(45deg)', display: 'flex' }}>
          <IconChat />
        </span>
        {/* Resolved check badge */}
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
  );
}

export type { PinMarkerProps };
