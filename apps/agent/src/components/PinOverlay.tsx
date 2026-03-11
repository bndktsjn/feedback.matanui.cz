import { useRef, useState, useEffect } from 'preact/hooks';
import type { Thread, DraftPin, Viewport } from '../types';
import { canonicalUrl } from '../utils';
import PinMarker from './PinMarker';
import DraftPinComponent from './DraftPin';
import Composer from './Composer';

interface PinOverlayProps {
  threads: Thread[];
  viewport: Viewport;
  currentPageUrl: string;
  activeThreadId: string | null;
  hoveredPinId: string | null;
  pinMode: boolean;
  draftPin: DraftPin | null;
  overlayRect: DOMRect | null;
  root: ShadowRoot;
  onPinClick: (t: Thread) => void;
  onPinHoverEnter: (t: Thread) => void;
  onPinHoverLeave: (t: Thread) => void;
  onPinDragEnd: (t: Thread, x: number, y: number) => void;
  onPinDragStart: () => void;
  onOverlayClick: (e: MouseEvent) => void;
  onDraftSubmit: (message: string) => void;
  onDraftCancel: () => void;
}

export default function PinOverlay({
  threads, viewport, currentPageUrl, activeThreadId, hoveredPinId,
  pinMode, draftPin, overlayRect, root,
  onPinClick, onPinHoverEnter, onPinHoverLeave, onPinDragEnd, onPinDragStart,
  onOverlayClick, onDraftSubmit, onDraftCancel,
}: PinOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const pinThreads = threads.filter((t) => {
    if (t.contextType !== 'pin' || t.xPct == null || t.yPct == null) return false;
    if ((t.viewport || 'desktop') !== viewport) return false;
    if (!currentPageUrl) return false;
    const threadUrl = canonicalUrl(t.pageUrl || '');
    return threadUrl === currentPageUrl;
  });

  function handleOverlayClick(e: MouseEvent) {
    if (!pinMode) return;
    onOverlayClick(e);
  }

  return (
    <div
      ref={overlayRef}
      class={`fixed inset-0 z-[9990] ${
        pinMode ? 'cursor-crosshair' : 'pointer-events-none'
      }`}
      style={{ top: '44px' }}
      onClick={handleOverlayClick}
    >
      {/* Existing pins */}
      {pinThreads.map((t) => (
        <PinMarker
          key={t.id}
          thread={t}
          isActive={activeThreadId === t.id}
          isHighlighted={hoveredPinId === t.id}
          overlayRect={overlayRect}
          onHoverEnter={onPinHoverEnter}
          onHoverLeave={onPinHoverLeave}
          onClick={onPinClick}
          onDragEnd={onPinDragEnd}
          onDragStart={onPinDragStart}
        />
      ))}

      {/* Draft pin with composer */}
      {draftPin && (
        <div
          class="absolute z-[70]"
          style={{
            left: `${draftPin.pinX}%`,
            top: `${draftPin.pinY}%`,
            pointerEvents: 'auto',
          }}
        >
          {/* Pin marker */}
          <div
            class="absolute"
            style={{ transform: 'translate(-50%, -100%)' }}
          >
            <div
              class="flex h-7 w-7 animate-pulse items-center justify-center bg-orange-500 text-white shadow-lg"
              style={{ borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' }}
            >
              <span style={{ transform: 'rotate(45deg)', display: 'flex' }}>
                <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </span>
            </div>
          </div>

          {/* Composer next to pin */}
          <div class={`${draftPin.pinX >= 65 ? '-translate-x-[calc(100%+12px)]' : 'translate-x-3'} -translate-y-1/2`}>
            <div
              class="w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-2xl"
              onClick={(e: MouseEvent) => e.stopPropagation()}
            >
              <Composer
                placeholder="Add a comment…"
                onSubmit={onDraftSubmit}
                autoFocus
              />
              <div class="mt-1 flex justify-end">
                <button
                  onClick={(e: MouseEvent) => { e.stopPropagation(); onDraftCancel(); }}
                  class="px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
