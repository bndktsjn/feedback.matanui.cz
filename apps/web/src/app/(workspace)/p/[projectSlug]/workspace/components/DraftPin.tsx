'use client';

import { useRef, useState, useCallback } from 'react';
import { clamp } from '../lib/utils';
import { IconChat } from './Icons';
import Composer from './Composer';
import type { StagedFile } from './Composer';

interface DraftPinProps {
  /** Pin position — primary anchor (Y in spec) */
  pinX: number;
  pinY: number;
  /** Secondary control point (X in spec) — absent for point-only pins */
  secondary?: { x: number; y: number };
  projectId: string;
  overlayRect: DOMRect | null;
  /** Submit: sends pin coords (Y) + optional secondary (X) */
  onSubmit: (message: string, pinX: number, pinY: number, files: StagedFile[], mentionIds: string[], secondary?: { x: number; y: number }) => Promise<void>;
  onCancel: () => void;
}

export { type StagedFile };

type DragTarget = 'pin' | 'secondary';

export default function DraftPin({ pinX: initPinX, pinY: initPinY, secondary: initSecondary, projectId, overlayRect, onSubmit, onCancel }: DraftPinProps) {
  const [pin, setPin] = useState({ x: initPinX, y: initPinY });
  const [sec, setSec] = useState<{ x: number; y: number } | null>(initSecondary ?? null);

  const [submitting, setSubmitting] = useState(false);
  const [shakeWarned, setShakeWarned] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const composerWrapRef = useRef<HTMLDivElement>(null);

  const dragRef = useRef<{
    target: DragTarget;
    startClientX: number;
    startClientY: number;
    startPt: { x: number; y: number };
  } | null>(null);

  const hasArea = sec !== null;

  /* ── Drag helpers ────────────────────────────────────────── */
  function startDrag(e: React.PointerEvent, target: DragTarget) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const pt = target === 'pin' ? pin : sec!;
    dragRef.current = { target, startClientX: e.clientX, startClientY: e.clientY, startPt: { ...pt } };
  }

  function onDragMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || !overlayRect) return;
    const dx = ((e.clientX - d.startClientX) / overlayRect.width) * 100;
    const dy = ((e.clientY - d.startClientY) / overlayRect.height) * 100;
    const nx = clamp(d.startPt.x + dx, 0, 100);
    const ny = clamp(d.startPt.y + dy, 0, 100);
    if (d.target === 'pin') setPin({ x: nx, y: ny });
    else setSec({ x: nx, y: ny });
  }

  function onDragEnd() { dragRef.current = null; }

  /* ── Submit ─────────────────────────────────────────────── */
  const handleSubmit = useCallback(async (content: string, files: StagedFile[], mentionIds: string[]) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(content, pin.x, pin.y, files, mentionIds, sec ?? undefined);
      onCancel();
    } finally {
      setSubmitting(false);
    }
  }, [onSubmit, pin, sec, submitting, onCancel]);

  /* ── Outside-click guard ────────────────────────────────── */
  function handleOverlayClick(e: React.MouseEvent) {
    if (composerWrapRef.current?.contains(e.target as Node)) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-draft-handle]')) return;
    if (hasContent && !shakeWarned) {
      setShakeWarned(true);
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
      return;
    }
    onCancel();
  }

  /* ── Layout ─────────────────────────────────────────────── */
  const flipLeft = pin.x >= 65;

  // Area rectangle between pin (Y) and secondary (X)
  const areaRect = hasArea ? {
    left: `${Math.min(pin.x, sec!.x)}%`,
    top: `${Math.min(pin.y, sec!.y)}%`,
    width: `${Math.abs(pin.x - sec!.x)}%`,
    height: `${Math.abs(pin.y - sec!.y)}%`,
  } : null;

  return (
    <>
      {/* Invisible click-catcher for outside-click guard */}
      <div className="absolute inset-0 z-[55]" onClick={handleOverlayClick} />

      {/* ── Area rectangle (if secondary exists) ── */}
      {hasArea && areaRect && (
        <div
          className="absolute z-[56] border border-dashed border-blue-500/70 bg-blue-500/5 pointer-events-none rounded-sm"
          style={areaRect}
        />
      )}

      {/* ── Secondary dot (X) ── */}
      {hasArea && (
        <div
          data-draft-handle="secondary"
          className="absolute z-[62] flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-blue-500 bg-white shadow-md hover:bg-blue-50 active:bg-blue-100 active:cursor-grabbing"
          style={{ left: `${sec!.x}%`, top: `${sec!.y}%`, pointerEvents: 'auto' }}
          onPointerDown={(e) => startDrag(e, 'secondary')}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          title="Drag to adjust area"
        />
      )}

      {/* ── Pin marker (Y) — always visible ── */}
      <div
        data-draft-handle="pin"
        className="absolute z-[62]"
        style={{
          left: `${pin.x}%`,
          top: `${pin.y}%`,
          transform: 'translate(-50%, -100%)',
          pointerEvents: 'auto',
        }}
      >
        <div
          className="flex h-7 w-7 animate-pulse items-center justify-center bg-orange-500 text-white shadow-lg cursor-grab active:cursor-grabbing"
          style={{ borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' }}
          onPointerDown={(e) => startDrag(e, 'pin')}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          title="Drag to reposition"
        >
          <span style={{ transform: 'rotate(45deg)', display: 'flex' }}>
            <IconChat />
          </span>
        </div>
      </div>

      {/* ── Composer next to pin ── */}
      <div
        className="absolute z-[70]"
        style={{
          left: `${pin.x}%`,
          top: `${pin.y}%`,
          pointerEvents: 'auto',
        }}
      >
        <div className={`${flipLeft ? '-translate-x-[calc(100%+12px)]' : 'translate-x-3'} -translate-y-1/2`}>
          <div
            ref={composerWrapRef}
            className={`w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-2xl ${shaking ? 'animate-shake' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Composer
              placeholder="Add a comment…"
              projectId={projectId}
              onSubmit={handleSubmit}
              sending={submitting}
              autoFocus
              onContentChange={setHasContent}
            />
          </div>
        </div>
      </div>
    </>
  );
}
