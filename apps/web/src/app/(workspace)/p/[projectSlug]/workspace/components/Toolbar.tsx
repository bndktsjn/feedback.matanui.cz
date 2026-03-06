'use client';

import { Viewport, StatusFilter, ScopeFilter, StatusCounts, SelectionMode } from '../types';
import { IconDesktop, IconTablet, IconMobile, IconMousePointerClick, IconChevronRight, IconChevronLeft, IconCrosshair, IconSquare } from './Icons';

const VP_ICONS: Record<Viewport, () => React.JSX.Element> = {
  desktop: IconDesktop,
  tablet: IconTablet,
  mobile: IconMobile,
};

interface ToolbarProps {
  projectName: string;
  projectSlug: string;
  viewport: Viewport;
  scopeFilter: ScopeFilter;
  statusFilter: StatusFilter;
  statusCounts: StatusCounts;
  pinMode: boolean;
  panelOpen: boolean;
  selectionMode: SelectionMode;
  onViewportChange: (vp: Viewport) => void;
  onScopeChange: (s: ScopeFilter) => void;
  onStatusChange: (s: StatusFilter) => void;
  onPinModeToggle: () => void;
  onPanelToggle: () => void;
  onSelectionModeChange: (m: SelectionMode) => void;
}

export default function Toolbar({
  projectName,
  projectSlug,
  viewport,
  scopeFilter,
  statusFilter,
  statusCounts,
  pinMode,
  panelOpen,
  selectionMode,
  onViewportChange,
  onScopeChange,
  onStatusChange,
  onPinModeToggle,
  onPanelToggle,
  onSelectionModeChange,
}: ToolbarProps) {
  return (
    <div className="relative flex h-11 shrink-0 items-center gap-2 border-b border-gray-700 bg-gray-800 px-3">
      <a
        href={`/p/${projectSlug}/threads`}
        className="mr-1 max-w-[140px] truncate text-sm font-medium text-gray-300 transition hover:text-white"
        title={projectName}
      >
        {projectName}
      </a>

      {/* Center: filter group (absolutely centered) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5">
        {/* Viewport switcher */}
      <div className="flex rounded-md bg-gray-700/60">
        {(['desktop', 'tablet', 'mobile'] as Viewport[]).map((vp) => {
          const Icon = VP_ICONS[vp];
          return (
            <button
              key={vp}
              onClick={() => onViewportChange(vp)}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                viewport === vp ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Icon />
              <span className="hidden sm:inline">{vp.charAt(0).toUpperCase() + vp.slice(1)}</span>
            </button>
          );
        })}
      </div>

      {/* Scope filter */}
      <div className="flex rounded-md bg-gray-700/60">
        {(['this_page', 'all_pages'] as ScopeFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => onScopeChange(s)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition ${
              scopeFilter === s ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {s === 'this_page' ? 'This page' : 'All pages'}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex rounded-md bg-gray-700/60">
        {(['open', 'resolved'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => onStatusChange(s)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition ${
              statusFilter === s ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {s === 'open' ? `Open (${statusCounts.open})` : `Resolved (${statusCounts.resolved})`}
          </button>
        ))}
      </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
      {/* Selection mode: Pin / Area — shown in comment mode */}
      {pinMode && (
        <div className="flex rounded-md bg-gray-700/60">
          <button
            onClick={() => onSelectionModeChange('pin')}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
              selectionMode === 'pin' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
            title="Point pin"
          >
            <IconCrosshair />
            <span className="hidden sm:inline">Pin</span>
          </button>
          <button
            onClick={() => onSelectionModeChange('area')}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
              selectionMode === 'area' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
            title="Area selection (Figma-style)"
          >
            <IconSquare />
            <span className="hidden sm:inline">Area</span>
          </button>
        </div>
      )}

      {/* Interact mode toggle */}
      <button
        onClick={onPinModeToggle}
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
          !pinMode ? 'bg-blue-600 text-white' : 'bg-gray-700/60 text-gray-400 hover:text-white'
        }`}
        title="Toggle interact mode (I)"
      >
        <IconMousePointerClick />
        <span className="hidden sm:inline">Interact</span>
        <kbd className="text-[10px] opacity-60">I</kbd>
      </button>

      {/* Panel toggle */}
      <button
        onClick={onPanelToggle}
        className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-700/60 text-gray-400 transition-all duration-200 hover:text-white hover:bg-gray-600/60"
        title={panelOpen ? 'Hide panel' : 'Show panel'}
      >
        <div className={`transition-transform duration-200 ${panelOpen ? 'rotate-180' : ''}`}>
          {panelOpen ? <IconChevronLeft /> : <IconChevronRight />}
        </div>
      </button>
      </div>
    </div>
  );
}
