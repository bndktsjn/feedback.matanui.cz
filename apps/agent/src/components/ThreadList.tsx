import type { Thread } from '../types';
import AuthorMeta from './AuthorMeta';
import { IconCheck, IconMoreDots, IconLink, IconTrash, IconInfo } from './Icons';
import MoreMenu from './MoreMenu';
import type { MenuItem } from './MoreMenu';
import { copyToClipboard } from '../utils';

function renderWithMentionsHtml(text: string): string {
  const mentionRegex = /@\[([^\]]+)\]\([^)]+\)/g;
  let result = text;
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(text)) !== null) {
    const mentionHtml = `<span class="inline-flex items-center rounded bg-blue-100 px-1 py-0.5 text-xs font-medium text-blue-700">@${match[1]}</span>`;
    result = result.replace(match[0], mentionHtml);
  }
  return result;
}

interface ThreadItemProps {
  thread: Thread;
  isActive: boolean;
  isHovered: boolean;
  root: ShadowRoot;
  onThreadClick: (t: Thread) => void;
  onThreadHoverEnter: (t: Thread) => void;
  onThreadHoverLeave: (t: Thread) => void;
  onResolve: (t: Thread) => void;
  onDelete: (t: Thread) => void;
  showToast: (msg: string) => void;
}

function ThreadItem({
  thread, isActive, isHovered, root,
  onThreadClick, onThreadHoverEnter, onThreadHoverLeave,
  onResolve, onDelete, showToast,
}: ThreadItemProps) {
  const menuItems: MenuItem[] = [
    {
      label: 'Copy link',
      icon: <IconLink />,
      action: () => copyToClipboard(window.location.href + '#thread=' + thread.id).then(() => showToast('Link copied')),
    },
    {
      label: 'Delete thread',
      icon: <IconTrash />,
      danger: true,
      action: () => onDelete(thread),
    },
  ];

  return (
    <li
      class={`group cursor-pointer border-b border-gray-50 transition ${
        isActive ? 'bg-blue-50' : isHovered ? 'bg-gray-50' : 'hover:bg-gray-50'
      }`}
      onMouseEnter={() => onThreadHoverEnter(thread)}
      onMouseLeave={() => onThreadHoverLeave(thread)}
      onClick={() => onThreadClick(thread)}
    >
      <div class="px-3 py-2.5">
        <div class="mb-1 flex items-center gap-1">
          <span class="mr-auto font-mono text-[10px] text-gray-400">#{thread.id.slice(0, 8)}</span>
          <div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <MoreMenu items={menuItems} root={root} />
            <button
              onClick={(e: MouseEvent) => { e.stopPropagation(); onResolve(thread); }}
              class={`flex h-5 w-5 items-center justify-center rounded-full border transition ${
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
        <AuthorMeta
          displayName={thread.author?.displayName}
          avatarUrl={thread.author?.avatarUrl}
          guestEmail={thread.guestEmail}
          createdAt={thread.createdAt}
        />
        <div class="mt-1">
          <p class="line-clamp-2 text-sm text-gray-800" dangerouslySetInnerHTML={{ __html: renderWithMentionsHtml(thread.message) }} />
          {thread._count.comments > 0 && (
            <p class="mt-0.5 text-[10px] text-gray-400">
              {thread._count.comments} {thread._count.comments === 1 ? 'reply' : 'replies'}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

interface ThreadListProps {
  threads: Thread[];
  scopeFilter: 'this_page' | 'all_pages';
  activeThreadId: string | null;
  hoveredPinId: string | null;
  root: ShadowRoot;
  onThreadClick: (thread: Thread) => void;
  onThreadHoverEnter: (thread: Thread) => void;
  onThreadHoverLeave: (thread: Thread) => void;
  onResolve: (thread: Thread) => void;
  onDelete: (thread: Thread) => void;
  showToast: (msg: string) => void;
}

export default function ThreadList({
  threads, scopeFilter, activeThreadId, hoveredPinId, root,
  onThreadClick, onThreadHoverEnter, onThreadHoverLeave,
  onResolve, onDelete, showToast,
}: ThreadListProps) {
  const itemProps = (thread: Thread) => ({
    thread,
    isActive: activeThreadId === thread.id,
    isHovered: hoveredPinId === thread.id,
    root,
    onThreadClick, onThreadHoverEnter, onThreadHoverLeave,
    onResolve, onDelete, showToast,
  });

  if (threads.length === 0) {
    return (
      <div class="p-6 text-center text-sm text-gray-500">
        No threads yet.
        <p class="mt-2 text-xs text-gray-400">
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
            <div class="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-1.5">
              <span class="min-w-0 flex-1 truncate text-[11px] font-semibold text-gray-500" title={groups[key].title}>
                {groups[key].title}
              </span>
              <span class="ml-2 shrink-0 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-500">
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
