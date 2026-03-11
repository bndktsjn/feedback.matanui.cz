import { useRef, useState, useMemo } from 'preact/hooks';
import type { Thread } from '../types';
import { clamp } from '../utils';
import { IconChat, IconCheck } from './Icons';

interface PinMarkerProps {
  thread: Thread;
  isActive: boolean;
  isHighlighted: boolean;
  overlayRect: DOMRect | null;
  onHoverEnter: (t: Thread) => void;
  onHoverLeave: (t: Thread) => void;
  onClick: (t: Thread) => void;
  onDragEnd: (thread: Thread, xPct: number, yPct: number) => void;
  onDragStart: () => void;
}

export default function PinMarker({
  thread, isActive, isHighlighted, overlayRect,
  onHoverEnter, onHoverLeave, onClick, onDragEnd, onDragStart,
}: PinMarkerProps) {
  const [pos, setPos] = useState({ x: thread.xPct ?? 0, y: thread.yPct ?? 0 });
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const dragState = useRef<{
    startClientX: number; startClientY: number;
    startX: number; startY: number;
    moved: boolean;
  } | null>(null);

  const prevThread = useRef(thread);
  if (prevThread.current.id !== thread.id ||
      (!dragging && (prevThread.current.xPct !== thread.xPct || prevThread.current.yPct !== thread.yPct))) {
    prevThread.current = thread;
    setPos({ x: thread.xPct ?? 0, y: thread.yPct ?? 0 });
  }

  function onPointerDown(e: PointerEvent) {
    if ((e as any).button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      startClientX: e.clientX, startClientY: e.clientY,
      startX: pos.x, startY: pos.y, moved: false,
    };
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragState.current || !overlayRect) return;
    const dx = (e.clientX - dragState.current.startClientX) / overlayRect.width * 100;
    const dy = (e.clientY - dragState.current.startClientY) / overlayRect.height * 100;
    if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
      if (!dragState.current.moved) {
        dragState.current.moved = true;
        setDragging(true);
        onDragStart();
      }
      setPos({
        x: clamp(dragState.current.startX + dx, 0, 100),
        y: clamp(dragState.current.startY + dy, 0, 100),
      });
    }
  }

  function onPointerUp() {
    if (!dragState.current) return;
    const ds = dragState.current;
    dragState.current = null;
    setDragging(false);
    if (!ds.moved) { onClick(thread); return; }
    onDragEnd(thread, pos.x, pos.y);
  }

  const resolved = thread.status === 'resolved';

  return (
    <div
      class={`absolute select-none ${isActive ? 'z-30' : 'z-20'}`}
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
      onMouseEnter={() => { if (!dragging) { setHovered(true); onHoverEnter(thread); } }}
      onMouseLeave={() => { if (!dragging) { setHovered(false); onHoverLeave(thread); } }}
      data-thread-id={thread.id}
    >
      <div
        class={`relative flex h-7 w-7 items-center justify-center shadow-lg transition-all duration-200 ${
          resolved ? 'bg-green-600 opacity-60' : 'bg-blue-700'
        } ${isActive || isHighlighted ? 'ring-2 ring-blue-400/70 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'hover:scale-110'}`}
        style={{ borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' }}
      >
        <span class="text-white" style={{ transform: 'rotate(45deg)', display: 'flex' }}>
          <IconChat />
        </span>
        {resolved && (
          <span
            class="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-600 text-white shadow"
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
