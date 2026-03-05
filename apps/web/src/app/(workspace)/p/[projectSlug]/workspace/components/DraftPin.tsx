'use client';

import { useRef, useState, useEffect } from 'react';
import { clamp } from '../lib/utils';
import { IconChat, IconSend } from './Icons';

interface DraftPinProps {
  x: number;
  y: number;
  overlayRect: DOMRect | null;
  onSubmit: (message: string, x: number, y: number) => Promise<void>;
  onCancel: () => void;
}

export default function DraftPin({ x: initX, y: initY, overlayRect, onSubmit, onCancel }: DraftPinProps) {
  const [pos, setPos] = useState({ x: initX, y: initY });
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [shakeWarned, setShakeWarned] = useState(false);
  const [shaking, setShaking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragState = useRef<{ startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

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

  async function handleSubmit() {
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(message.trim(), pos.x, pos.y);
    } finally {
      setSubmitting(false);
    }
  }

  function handleOverlayClick(e: React.MouseEvent) {
    // Clicks on the composer itself don't count as outside clicks
    if (composerRef.current?.contains(e.target as Node)) return;
    if (message.trim().length >= 4 && !shakeWarned) {
      setShakeWarned(true);
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
      return;
    }
    onCancel();
  }

  // Flip composer to left side when pin is near right edge
  const flipLeft = pos.x >= 70;

  return (
    <>
      {/* Invisible click-catcher for outside-click guard */}
      <div className="absolute inset-0 z-0" onClick={handleOverlayClick} />

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
            ref={composerRef}
            className={`w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-2xl ${shaking ? 'animate-shake' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the issue…"
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
                if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
              }}
            />
            <div className="mt-2 flex items-center justify-between">
              <button
                onClick={onCancel}
                className="text-xs text-gray-500 hover:text-gray-700"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!message.trim() || submitting}
                className="flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                type="button"
              >
                <IconSend />
                {submitting ? 'Sending…' : 'Create'}
              </button>
            </div>
          </div>
          </div>
        </div>
      </div>
    </>
  );
}
