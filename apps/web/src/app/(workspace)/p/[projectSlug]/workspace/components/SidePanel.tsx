'use client';

import { Thread } from '@/lib/api';
import { IconClose } from './Icons';
import ThreadList from './ThreadList';
import { ScopeFilter, Viewport, StatusFilter, StatusCounts } from '../types';

interface SidePanelProps {
  open: boolean;
  threads: Thread[];
  activeThreadId: string | null;
  viewport: Viewport;
  scopeFilter: ScopeFilter;
  statusFilter: StatusFilter;
  statusCounts: StatusCounts;
  hoveredPinId: string | null;
  onClose: () => void;
  onThreadClick: (thread: Thread) => void;
  onThreadHoverEnter: (thread: Thread) => void;
  onThreadHoverLeave: (thread: Thread) => void;
  onResolve: (thread: Thread) => void;
  onDelete: (thread: Thread) => void;
  onShowEnv: (env: Record<string, unknown>, rect: DOMRect) => void;
  showToast: (msg: string) => void;
}

export default function SidePanel({
  open,
  threads,
  activeThreadId,
  viewport,
  scopeFilter,
  statusFilter,
  statusCounts,
  hoveredPinId,
  onClose,
  onThreadClick,
  onThreadHoverEnter,
  onThreadHoverLeave,
  onResolve,
  onDelete,
  onShowEnv,
  showToast,
}: SidePanelProps) {
  return (
    <div
      className={`fixed bottom-0 right-0 top-11 z-30 w-80 border-l border-gray-200 bg-white shadow-[-4px_0_24px_rgba(0,0,0,0.12)] transition-transform duration-200 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-gray-900">
            Feedback
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <IconClose />
          </button>
        </div>

        {/* Active filter labels */}
        <div className="flex flex-wrap gap-1.5 border-b border-gray-100 px-4 py-2">
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
            {viewport.charAt(0).toUpperCase() + viewport.slice(1)}
          </span>
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
            {scopeFilter === 'this_page' ? 'This page' : 'All pages'}
          </span>
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
            {statusFilter === 'open'
              ? `Open (${statusCounts.open})`
              : `Resolved (${statusCounts.resolved})`}
          </span>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <ThreadList
              threads={threads}
              scopeFilter={scopeFilter}
              activeThreadId={activeThreadId}
              hoveredPinId={hoveredPinId}
              onThreadClick={onThreadClick}
              onThreadHoverEnter={onThreadHoverEnter}
              onThreadHoverLeave={onThreadHoverLeave}
              onResolve={onResolve}
              onDelete={onDelete}
              onShowEnv={onShowEnv}
              showToast={showToast}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
