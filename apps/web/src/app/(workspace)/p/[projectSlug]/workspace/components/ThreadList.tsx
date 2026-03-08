'use client';

import React from 'react';
import { Thread } from '@/lib/api';
import AuthorMeta from './AuthorMeta';
import ThreadMenu from './ThreadMenu';
import { IconCheck } from './Icons';

/** Render text with @[Name](id) mentions styled as blue inline badges */
function renderWithMentions(text: string): { __html: string } {
  const mentionRegex = /@\[([^\]]+)\]\([^)]+\)/g;
  let result = text;
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(text)) !== null) {
    const mentionHtml = `<span class="inline-flex items-center rounded bg-blue-100 px-1 py-0.5 text-xs font-medium text-blue-700">@${match[1]}</span>`;
    result = result.replace(match[0], mentionHtml);
  }
  return { __html: result };
}

interface ThreadListProps {
  threads: Thread[];
  scopeFilter: 'this_page' | 'all_pages';
  activeThreadId: string | null;
  hoveredPinId: string | null;
  onThreadClick: (thread: Thread) => void;
  onThreadHoverEnter: (thread: Thread) => void;
  onThreadHoverLeave: (thread: Thread) => void;
  onResolve: (thread: Thread) => void;
  onDelete: (thread: Thread) => void;
  onShowEnv: (env: Record<string, unknown>, rect: DOMRect) => void;
  showToast: (msg: string) => void;
}

function ThreadItem({
  thread,
  isActive,
  isHovered,
  onThreadClick,
  onThreadHoverEnter,
  onThreadHoverLeave,
  onResolve,
  onDelete,
  onShowEnv,
  showToast,
}: {
  thread: Thread;
  isActive: boolean;
  isHovered: boolean;
  onThreadClick: (t: Thread) => void;
  onThreadHoverEnter: (t: Thread) => void;
  onThreadHoverLeave: (t: Thread) => void;
  onResolve: (t: Thread) => void;
  onDelete: (t: Thread) => void;
  onShowEnv: (env: Record<string, unknown>, rect: DOMRect) => void;
  showToast: (msg: string) => void;
}) {
  return (
    <li
      className={`group cursor-pointer border-b border-gray-50 transition ${
        isActive ? 'bg-blue-50' : isHovered ? 'bg-gray-50' : 'hover:bg-gray-50'
      }`}
      onMouseEnter={() => onThreadHoverEnter(thread)}
      onMouseLeave={() => onThreadHoverLeave(thread)}
      onClick={() => onThreadClick(thread)}
    >
      <div className="px-3 py-2.5">
        {/* Actions row */}
        <div className="mb-1 flex items-center gap-1">
          <span className="mr-auto font-mono text-[10px] text-gray-400">#{thread.id.slice(0, 8)}</span>
          {/* 4.3: Actions visible only on hover */}
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <ThreadMenu
              thread={thread}
              onResolve={onResolve}
              onDelete={onDelete}
              onShowEnv={onShowEnv}
              showToast={showToast}
            />
            <button
              onClick={(e) => { e.stopPropagation(); onResolve(thread); }}
              className={`flex h-5 w-5 items-center justify-center rounded-full border transition ${
                thread.status === 'resolved'
                  ? 'border-green-600 bg-green-600 text-white hover:border-amber-500 hover:bg-amber-50 hover:text-amber-600'
                  : 'border-gray-300 text-gray-400 hover:border-green-600 hover:bg-green-50 hover:text-green-600'
              }`}
              title={thread.status === 'resolved' ? 'Reopen' : 'Resolve'}
            >
              <IconCheck />
            </button>
          </div>
        </div>

        {/* Author row */}
        <AuthorMeta
          displayName={thread.author?.displayName}
          avatarUrl={thread.author?.avatarUrl}
          guestEmail={thread.guestEmail}
          createdAt={thread.createdAt}
        />

        {/* Message preview */}
        <div className="mt-1">
          <p className="line-clamp-2 text-sm text-gray-800" dangerouslySetInnerHTML={renderWithMentions(thread.message)} />
          {thread._count.comments > 0 && (
            <p className="mt-0.5 text-[10px] text-gray-400">
              {thread._count.comments} {thread._count.comments === 1 ? 'reply' : 'replies'}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export default function ThreadList({
  threads,
  scopeFilter,
  activeThreadId,
  hoveredPinId,
  onThreadClick,
  onThreadHoverEnter,
  onThreadHoverLeave,
  onResolve,
  onDelete,
  onShowEnv,
  showToast,
}: ThreadListProps) {
  const itemProps = (thread: Thread) => ({
    thread,
    isActive: activeThreadId === thread.id,
    isHovered: hoveredPinId === thread.id,
    onThreadClick,
    onThreadHoverEnter,
    onThreadHoverLeave,
    onResolve,
    onDelete,
    onShowEnv,
    showToast,
  });

  if (threads.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        No threads yet.
        <p className="mt-2 text-xs text-gray-400">
          Click <strong>Pin</strong> in the toolbar, then click on the page to leave feedback.
        </p>
      </div>
    );
  }

  if (scopeFilter === 'all_pages') {
    const groups: Record<string, { title: string; threads: Thread[] }> = {};
    const order: string[] = [];
    threads.forEach((t) => {
      const key = t.pageUrl || '(unknown)';
      if (!groups[key]) { groups[key] = { title: t.pageTitle || key, threads: [] }; order.push(key); }
      groups[key].threads.push(t);
    });

    return (
      <div>
        {order.map((key) => (
          <div key={key}>
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-gray-500" title={groups[key].title}>
                {groups[key].title}
              </span>
              <span className="ml-2 shrink-0 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-500">
                {groups[key].threads.length}
              </span>
            </div>
            <ul>
              {groups[key].threads.map((t) => (
                <ThreadItem key={t.id} {...itemProps(t)} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return (
    <ul>
      {threads.map((t) => (
        <ThreadItem key={t.id} {...itemProps(t)} />
      ))}
    </ul>
  );
}
