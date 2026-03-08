'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './Icons';

interface ScreenshotLightboxProps {
  screenshotUrl: string;
  onClose: () => void;
}

/**
 * View-only lightbox for screenshots (non-editors).
 * Matches WPF plugin openScreenshotLightbox: dim background, contain-fit image,
 * close via X / Esc / click-outside.
 */
export default function ScreenshotLightbox({ screenshotUrl, onClose }: ScreenshotLightboxProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[99998] flex flex-col bg-black/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-end px-4 py-2">
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
          title="Close"
        >
          <IconClose />
        </button>
      </div>

      {/* Image container */}
      <div
        className="flex flex-1 items-center justify-center p-4 overflow-auto"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <img
          src={screenshotUrl}
          alt="Screenshot"
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        />
      </div>
    </div>,
    document.body
  );
}
