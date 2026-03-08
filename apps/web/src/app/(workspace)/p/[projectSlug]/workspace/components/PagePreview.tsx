'use client';

import { useState } from 'react';

interface PagePreviewProps {
  /** If a real screenshot URL exists, show it as an image */
  screenshotUrl?: string | null;
  /** The page URL to render as an iframe fallback */
  pageUrl?: string | null;
  /** Click handler for the screenshot image */
  onScreenshotClick?: () => void;
  /** Optional overlay actions (edit/delete buttons) */
  actions?: React.ReactNode;
}

/**
 * Shows either a screenshot image or a live iframe preview of the page URL.
 * Used in thread detail views as a reliable replacement for cross-origin screenshot capture.
 */
export default function PagePreview({ screenshotUrl, pageUrl, onScreenshotClick, actions }: PagePreviewProps) {
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);

  // If we have a real screenshot, show it
  if (screenshotUrl) {
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

  // Otherwise, render the page URL as an iframe preview
  if (!pageUrl) return null;

  return (
    <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 relative bg-gray-50">
      {/* Loading state */}
      {iframeLoading && !iframeError && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-gray-50">
          <div className="flex flex-col items-center gap-1.5">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
            <span className="text-[10px] text-gray-400">Loading preview…</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {iframeError && (
        <div className="flex items-center justify-center py-6 px-3">
          <div className="flex flex-col items-center gap-1 text-center">
            <svg className="h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
            <span className="text-[10px] text-gray-400">Preview unavailable</span>
            <a
              href={pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-blue-500 hover:text-blue-600 underline"
            >
              Open page
            </a>
          </div>
        </div>
      )}

      {/* Iframe preview */}
      {!iframeError && (
        <div className="relative" style={{ paddingBottom: '56.25%' /* 16:9 aspect ratio */ }}>
          <iframe
            src={pageUrl}
            className="absolute inset-0 w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
            loading="lazy"
            title="Page preview"
            onLoad={() => setIframeLoading(false)}
            onError={() => { setIframeError(true); setIframeLoading(false); }}
          />
          {/* Click overlay to open in new tab */}
          <a
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 z-10"
            title="Open page in new tab"
          >
            <span className="sr-only">Open page</span>
          </a>
        </div>
      )}
    </div>
  );
}
