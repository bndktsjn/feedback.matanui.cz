'use client';

import { forwardRef, useState, useEffect, useRef } from 'react';
import { Viewport } from '../types';

const DEVICE_DIMS: Record<Viewport, { w: number; h: number } | null> = {
  desktop: null,
  tablet: { w: 768, h: 1024 },
  mobile: { w: 375, h: 812 },
};

interface IframeViewerProps {
  src: string;
  projectName: string;
  viewport: Viewport;
  panelOpen: boolean;
}

/**
 * Single-iframe viewer. ONE return path — the iframe is always at the exact
 * same JSX tree position so React never unmounts it on viewport switch.
 * Matches WPF plugin: one iframe element, just change width/height on toggle.
 */
const IframeViewer = forwardRef<HTMLIFrameElement, IframeViewerProps>(
  ({ src, projectName, viewport, panelOpen }, ref) => {
    const dims = DEVICE_DIMS[viewport];
    const isDevice = dims != null;
    const [transitioning, setTransitioning] = useState(false);
    const prevViewport = useRef(viewport);

    // Brief fade overlay during viewport switch
    useEffect(() => {
      if (prevViewport.current !== viewport) {
        prevViewport.current = viewport;
        setTransitioning(true);
        const timer = setTimeout(() => setTransitioning(false), 400);
        return () => clearTimeout(timer);
      }
    }, [viewport]);

    // Single return path — iframe always at children index 2 of innerDiv
    return (
      <div
        className={`relative h-full w-full ${isDevice ? 'flex items-center justify-center bg-gray-200' : ''}`}
      >
        {/* Transition overlay — always at children index 0 */}
        {transitioning && (
          <div className="pointer-events-none absolute inset-0 z-20 bg-gray-900/60 transition-opacity duration-300">
            <div className="flex h-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </div>
          </div>
        )}

        {/* Mid wrapper — always at children index 1 */}
        <div className={isDevice ? 'flex flex-col items-center' : 'h-full w-full'}>
          {/* Inner frame — always at children index 0 of mid wrapper */}
          <div
            className={
              isDevice
                ? 'relative overflow-hidden rounded-[2rem] border-[8px] border-gray-800 bg-gray-800 shadow-2xl'
                : 'relative h-full w-full'
            }
            style={
              isDevice
                ? {
                    width: dims!.w + 16,
                    height: dims!.h + 16,
                    maxHeight: 'calc(100vh - 80px)',
                    maxWidth: panelOpen ? 'calc(100vw - 360px)' : 'calc(100vw - 40px)',
                  }
                : undefined
            }
          >
            {/* Device decorations — always at children index 0 and 1 */}
            {viewport === 'mobile' ? (
              <div className="absolute left-1/2 top-0 z-30 h-5 w-28 -translate-x-1/2 rounded-b-xl bg-gray-800" />
            ) : null}
            {viewport === 'tablet' ? (
              <div className="absolute left-1/2 top-2 z-30 h-2 w-2 -translate-x-1/2 rounded-full bg-gray-600" />
            ) : null}

            {/* THE iframe — always at children index 2. Never moves in the tree. */}
            <iframe
              ref={ref}
              src={src}
              className="border-0 bg-white"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation-by-user-activation"
              title={`${projectName} preview`}
              style={
                isDevice
                  ? { width: dims!.w, height: dims!.h }
                  : { width: '100%', height: '100%' }
              }
            />
          </div>

          {/* Dimensions label — always at children index 1 of mid wrapper */}
          {isDevice ? (
            <div className="mt-2 text-[10px] text-gray-500">
              {dims!.w} × {dims!.h}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
);

IframeViewer.displayName = 'IframeViewer';

export default IframeViewer;
