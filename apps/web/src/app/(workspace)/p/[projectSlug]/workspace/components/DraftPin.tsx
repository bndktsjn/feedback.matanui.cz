'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { clamp } from '../lib/utils';
import { IconChat } from './Icons';
import Composer from './Composer';
import type { StagedFile } from './Composer';

interface DraftPinProps {
  x: number;
  y: number;
  projectId: string;
  overlayRect: DOMRect | null;
  onSubmit: (message: string, x: number, y: number, files: StagedFile[], mentionIds: string[]) => Promise<void>;
  onCancel: () => void;
  /** Area bounds — present when selecting a rectangle instead of a point */
  area?: { x2: number; y2: number };
}

export { type StagedFile };

export default function DraftPin({ x: initX, y: initY, projectId, overlayRect, onSubmit, onCancel, area }: DraftPinProps) {
  const [pos, setPos] = useState({ x: initX, y: initY });
  const [submitting, setSubmitting] = useState(false);
  const [shakeWarned, setShakeWarned] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const dragState = useRef<{ startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  const composerWrapRef = useRef<HTMLDivElement>(null);

  // Keep area in sync with initial props (it doesn't change after creation)
  const areaRef = useRef(area);

  function onPinIconPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: pos.x,
      startY: pos.y,
    };
  }

  function onPinIconPointerMove(e: React.PointerEvent) {
    if (!dragState.current || !overlayRect) return;
    const dx = (e.clientX - dragState.current.startClientX) / overlayRect.width * 100;
    const dy = (e.clientY - dragState.current.startClientY) / overlayRect.height * 100;
    setPos({
      x: clamp(dragState.current.startX + dx, 0, 100),
      y: clamp(dragState.current.startY + dy, 0, 100),
    });
  }

  function onPinIconPointerUp() {
    dragState.current = null;
  }

  const handleSubmit = useCallback(async (content: string, files: StagedFile[], mentionIds: string[]) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(content, pos.x, pos.y, files, mentionIds);
    } finally {
      setSubmitting(false);
    }
  }, [onSubmit, pos.x, pos.y, submitting]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (composerWrapRef.current?.contains(e.target as Node)) return;
    if (hasContent && !shakeWarned) {
      setShakeWarned(true);
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
      return;
    }
    onCancel();
  }

  // Flip composer to left side when pin is near right edge
  const flipLeft = pos.x >= 70;

  // For area mode, render a dashed rectangle
  const areaStyle = areaRef.current ? {
    left: `${Math.min(pos.x, areaRef.current.x2)}%`,
    top: `${Math.min(pos.y, areaRef.current.y2)}%`,
    width: `${Math.abs(areaRef.current.x2 - pos.x)}%`,
    height: `${Math.abs(areaRef.current.y2 - pos.y)}%`,
  } : null;

  return (
    <>
      {/* Invisible click-catcher for outside-click guard */}
      <div className="absolute inset-0 z-0" onClick={handleOverlayClick} />

      {/* Area highlight rectangle (Figma-style) */}
      {areaStyle && (
        <div
          className="absolute z-[5] border-2 border-dashed border-orange-400 bg-orange-400/10 pointer-events-none"
          style={areaStyle}
        />
      )}

      {/* Pin marker — draggable */}
      <div
        className="absolute z-10"
        style={{
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          transform: 'translate(-50%, -100%)',
          pointerEvents: 'auto',
        }}
      >
        <div className="relative">
          {/* Teardrop - this is the draggable part */}
          <div
            className="flex h-7 w-7 animate-pulse items-center justify-center bg-orange-500 text-white shadow-lg"
            style={{ 
              borderRadius: '50% 50% 50% 0', 
              transform: 'rotate(-45deg)',
              cursor: dragState.current ? 'grabbing' : 'grab'
            }}
            onPointerDown={onPinIconPointerDown}
            onPointerMove={onPinIconPointerMove}
            onPointerUp={onPinIconPointerUp}
            title="Drag to reposition pin"
          >
            <span style={{ transform: 'rotate(45deg)', display: 'flex' }}>
              <IconChat />
            </span>
          </div>

          {/* Composer — positioned relative to pin */}
          <div
            className={`absolute top-0 z-20 ${flipLeft ? 'right-10' : 'left-10'}`}
            style={{ transform: 'translateY(-50%)' }}
          >
            <div
              ref={composerWrapRef}
              className={`w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-2xl ${shaking ? 'animate-shake' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Composer
                placeholder="Describe the issue…"
                projectId={projectId}
                onSubmit={handleSubmit}
                sending={submitting}
                autoFocus
                shortcutHint
                onContentChange={setHasContent}
              />
              <button
                onClick={onCancel}
                className="mt-1 px-1 text-[10px] text-gray-400 hover:text-gray-600"
                type="button"
              >
                Cancel · Esc
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
