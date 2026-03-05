'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconGlobe, IconCpu, IconDesktop, IconTablet, IconMobile, IconMaximize, IconInfo, IconClose } from './Icons';

interface EnvData {
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  osVersion?: string;
  viewportMode?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio?: number;
  userAgent?: string;
}

interface EnvironmentPopoverProps {
  env: EnvData;
  anchorRect: DOMRect;
  onClose: () => void;
}

function VpIcon({ mode }: { mode?: string }) {
  if (mode === 'tablet') return <IconTablet />;
  if (mode === 'mobile') return <IconMobile />;
  return <IconDesktop />;
}

export default function EnvironmentPopover({ env, anchorRect, onClose }: EnvironmentPopoverProps) {
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    function onClickOutside(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    }
    setTimeout(() => {
      document.addEventListener('keydown', onKey);
      document.addEventListener('mousedown', onClickOutside, true);
    }, 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside, true);
    };
  }, [onClose]);

  const rows: { icon: React.ReactNode; label: string; value: string }[] = [];
  if (env.browserName) rows.push({ icon: <IconGlobe />, label: 'Browser', value: `${env.browserName}${env.browserVersion ? ' ' + env.browserVersion : ''}` });
  if (env.osName) rows.push({ icon: <IconCpu />, label: 'OS', value: `${env.osName}${env.osVersion ? ' ' + env.osVersion : ''}` });
  if (env.viewportMode) rows.push({ icon: <VpIcon mode={env.viewportMode} />, label: 'Viewport', value: env.viewportMode });
  if (env.viewportWidth && env.viewportHeight) rows.push({ icon: <IconMaximize />, label: 'Dimensions', value: `${env.viewportWidth}×${env.viewportHeight}` });
  if (env.userAgent) rows.push({ icon: <IconInfo />, label: 'User Agent', value: env.userAgent });

  const top = anchorRect.bottom + 6 + window.scrollY;
  const left = anchorRect.left + window.scrollX;

  return createPortal(
    <div
      ref={popRef}
      className="fixed z-[99996] w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
      style={{ top, left }}
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <span className="text-xs font-semibold text-gray-600">Environment</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconClose /></button>
      </div>
      <div className="py-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-start gap-2 px-3 py-1.5">
            <span className="mt-0.5 shrink-0 text-gray-400">{r.icon}</span>
            <span className="w-20 shrink-0 text-[11px] text-gray-500">{r.label}</span>
            <span className="min-w-0 flex-1 break-all text-[11px] text-gray-800 line-clamp-2" title={r.value}>{r.value}</span>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="px-3 py-2 text-xs text-gray-400">No environment data available.</p>
        )}
      </div>
    </div>,
    document.body
  );
}
