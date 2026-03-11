import { useEffect } from 'preact/hooks';
import { IconClose } from './Icons';

interface ScreenshotLightboxProps {
  screenshotUrl: string;
  onClose: () => void;
  root: ShadowRoot;
}

export default function ScreenshotLightbox({ screenshotUrl, onClose, root }: ScreenshotLightboxProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      class="fixed inset-0 z-[99998] flex flex-col bg-black/80"
      onClick={(e: MouseEvent) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div class="flex shrink-0 items-center justify-end px-4 py-2">
        <button
          onClick={onClose}
          class="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
          title="Close"
        >
          <IconClose />
        </button>
      </div>
      <div
        class="flex flex-1 items-center justify-center p-4 overflow-auto"
        onClick={(e: MouseEvent) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <img
          src={screenshotUrl}
          alt="Screenshot"
          class="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        />
      </div>
    </div>
  );
}
