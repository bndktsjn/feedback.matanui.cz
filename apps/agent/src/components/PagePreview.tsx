import type { ComponentChildren } from 'preact';

interface PagePreviewProps {
  screenshotUrl?: string | null;
  onScreenshotClick?: () => void;
  actions?: ComponentChildren;
}

export default function PagePreview({ screenshotUrl, onScreenshotClick, actions }: PagePreviewProps) {
  if (!screenshotUrl) return null;
  return (
    <div class="mt-2 rounded-lg overflow-hidden border border-gray-200 relative group">
      <img
        src={screenshotUrl}
        alt="Screenshot"
        class="w-full cursor-pointer hover:opacity-90 transition"
        onClick={onScreenshotClick}
      />
      {actions && (
        <div class="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
          {actions}
        </div>
      )}
    </div>
  );
}
