'use client';

interface PagePreviewProps {
  /** If a real screenshot URL exists, show it as an image */
  screenshotUrl?: string | null;
  /** Click handler for the screenshot image */
  onScreenshotClick?: () => void;
  /** Optional overlay actions (edit/delete buttons) */
  actions?: React.ReactNode;
}

/**
 * Shows a screenshot thumbnail when available.
 * Matches WPF plugin renderScreenshot: thumbnail image with overlay actions.
 * No page URL iframe fallback — only screenshots/attachments.
 */
export default function PagePreview({ screenshotUrl, onScreenshotClick, actions }: PagePreviewProps) {
  if (!screenshotUrl) return null;

  return (
    <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 relative group">
      <img
        src={screenshotUrl}
        alt="Screenshot"
        className="w-full cursor-pointer hover:opacity-90 transition"
        onClick={onScreenshotClick}
      />
      {actions && (
        <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
          {actions}
        </div>
      )}
    </div>
  );
}
