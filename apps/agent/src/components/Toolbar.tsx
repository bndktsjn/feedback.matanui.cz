import type { Viewport, StatusFilter, ScopeFilter, StatusCounts } from '../types';
import { IconDesktop, IconTablet, IconMobile, IconMousePointerClick, IconChevronRight, IconChevronLeft } from './Icons';

const VP_ICONS: Record<Viewport, () => any> = {
  desktop: IconDesktop,
  tablet: IconTablet,
  mobile: IconMobile,
};

interface ToolbarProps {
  viewport: Viewport;
  scopeFilter: ScopeFilter;
  statusFilter: StatusFilter;
  statusCounts: StatusCounts;
  pinMode: boolean;
  panelOpen: boolean;
  onViewportChange: (vp: Viewport) => void;
  onScopeChange: (s: ScopeFilter) => void;
  onStatusChange: (s: StatusFilter) => void;
  onPinModeToggle: () => void;
  onPanelToggle: () => void;
}

export default function Toolbar({
  viewport,
  scopeFilter,
  statusFilter,
  statusCounts,
  pinMode,
  panelOpen,
  onViewportChange,
  onScopeChange,
  onStatusChange,
  onPinModeToggle,
  onPanelToggle,
}: ToolbarProps) {
  return (
    <div class="relative flex h-11 shrink-0 items-center gap-2 border-b border-gray-700 bg-gray-800 px-3">
      {/* Center: filter group (absolutely centered) */}
      <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5">
        {/* Viewport switcher */}
        <div class="flex rounded-md bg-gray-700/60">
          {(['desktop', 'tablet', 'mobile'] as Viewport[]).map((vp) => {
            const Icon = VP_ICONS[vp];
            return (
              <button
                key={vp}
                onClick={() => onViewportChange(vp)}
                class={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                  viewport === vp ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Icon />
                <span class="hidden sm:inline">{vp.charAt(0).toUpperCase() + vp.slice(1)}</span>
              </button>
            );
          })}
        </div>

        {/* Scope filter */}
        <div class="flex rounded-md bg-gray-700/60">
          {(['this_page', 'all_pages'] as ScopeFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => onScopeChange(s)}
              class={`rounded-md px-2 py-1 text-xs font-medium transition ${
                scopeFilter === s ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {s === 'this_page' ? 'This page' : 'All pages'}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div class="flex rounded-md bg-gray-700/60">
          {(['open', 'resolved'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => onStatusChange(s)}
              class={`rounded-md px-2 py-1 text-xs font-medium transition ${
                statusFilter === s ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {s === 'open' ? `Open (${statusCounts.open})` : `Resolved (${statusCounts.resolved})`}
            </button>
          ))}
        </div>
      </div>

      <div class="ml-auto flex items-center gap-2">
        {/* Interact mode toggle */}
        <button
          onClick={onPinModeToggle}
          class={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
            !pinMode ? 'bg-blue-600 text-white' : 'bg-gray-700/60 text-gray-400 hover:text-white'
          }`}
          title="Toggle interact mode (I)"
        >
          <IconMousePointerClick />
          <span class="hidden sm:inline">Interact</span>
          <kbd class="text-[10px] opacity-60">I</kbd>
        </button>

        {/* Panel toggle */}
        <button
          onClick={onPanelToggle}
          class="flex h-7 w-7 items-center justify-center rounded-md bg-gray-700/60 text-gray-400 transition-all duration-200 hover:text-white hover:bg-gray-600/60"
          title={panelOpen ? 'Hide panel' : 'Show panel'}
        >
          <div class={`transition-transform duration-200 ${panelOpen ? 'rotate-180' : ''}`}>
            {panelOpen ? <IconChevronLeft /> : <IconChevronRight />}
          </div>
        </button>
      </div>
    </div>
  );
}
