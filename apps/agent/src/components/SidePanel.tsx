import type { Thread, Viewport, ScopeFilter, StatusFilter, StatusCounts } from '../types';
import { IconClose } from './Icons';
import ThreadList from './ThreadList';
import ThreadDetail from './ThreadDetail';

interface SidePanelProps {
  open: boolean;
  threads: Thread[];
  activeThread: Thread | null;
  activeThreadId: string | null;
  viewport: Viewport;
  scopeFilter: ScopeFilter;
  statusFilter: StatusFilter;
  statusCounts: StatusCounts;
  hoveredPinId: string | null;
  root: ShadowRoot;
  onClose: () => void;
  onThreadClick: (thread: Thread) => void;
  onThreadHoverEnter: (thread: Thread) => void;
  onThreadHoverLeave: (thread: Thread) => void;
  onResolve: (thread: Thread) => void;
  onDelete: (thread: Thread) => void;
  onBack: () => void;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

export default function SidePanel({
  open, threads, activeThread, activeThreadId,
  viewport, scopeFilter, statusFilter, statusCounts,
  hoveredPinId, root,
  onClose, onThreadClick, onThreadHoverEnter, onThreadHoverLeave,
  onResolve, onDelete, onBack, onRefresh, showToast,
}: SidePanelProps) {
  return (
    <div
      class={`fixed bottom-0 right-0 top-11 z-30 w-80 border-l border-gray-200 bg-white shadow-[-4px_0_24px_rgba(0,0,0,0.12)] transition-transform duration-200 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div class="flex h-full flex-col">
        {activeThread ? (
          <ThreadDetail
            thread={activeThread}
            root={root}
            onBack={onBack}
            onResolve={onResolve}
            onDelete={onDelete}
            onRefresh={onRefresh}
            showToast={showToast}
          />
        ) : (
          <>
            {/* Header */}
            <div class="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-2.5">
              <h2 class="text-sm font-semibold text-gray-900">Feedback</h2>
              <button onClick={onClose} class="text-gray-400 hover:text-gray-600 transition">
                <IconClose />
              </button>
            </div>

            {/* Active filter labels */}
            <div class="flex flex-wrap gap-1.5 border-b border-gray-100 px-4 py-2">
              <span class="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                {viewport.charAt(0).toUpperCase() + viewport.slice(1)}
              </span>
              <span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                {scopeFilter === 'this_page' ? 'This page' : 'All pages'}
              </span>
              <span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                {statusFilter === 'open'
                  ? `Open (${statusCounts.open})`
                  : `Resolved (${statusCounts.resolved})`}
              </span>
            </div>

            {/* Body */}
            <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div class="flex-1 overflow-y-auto">
                <ThreadList
                  threads={threads}
                  scopeFilter={scopeFilter}
                  activeThreadId={activeThreadId}
                  hoveredPinId={hoveredPinId}
                  root={root}
                  onThreadClick={onThreadClick}
                  onThreadHoverEnter={onThreadHoverEnter}
                  onThreadHoverLeave={onThreadHoverLeave}
                  onResolve={onResolve}
                  onDelete={onDelete}
                  showToast={showToast}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
