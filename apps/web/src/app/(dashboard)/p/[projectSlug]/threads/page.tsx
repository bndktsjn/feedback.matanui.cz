'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { threads, orgs, projects, comments as commentsApi, auth, Thread, Comment, User } from '@/lib/api';

interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
  orgId: string;
  currentUserRole?: string;
}

const STATUSES = [
  { value: 'open', label: 'Open', color: 'bg-green-100 text-green-700' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'resolved', label: 'Resolved', color: 'bg-blue-100 text-blue-700' },
  { value: 'closed', label: 'Closed', color: 'bg-gray-100 text-gray-600' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'text-gray-500' },
  { value: 'medium', label: 'Medium', color: 'text-blue-600' },
  { value: 'high', label: 'High', color: 'text-orange-600' },
  { value: 'critical', label: 'Critical', color: 'text-red-600' },
];

const TYPES = [
  { value: 'general', label: 'General' },
  { value: 'bug', label: 'Bug' },
  { value: 'design', label: 'Design' },
  { value: 'content', label: 'Content' },
];

const TYPE_ICONS: Record<string, string> = {
  bug: '\uD83D\uDC1B',
  design: '\uD83C\uDFA8',
  content: '\uD83D\uDCDD',
  general: '\uD83D\uDCAC',
};

function statusInfo(s: string) {
  return STATUSES.find((st) => st.value === s) || STATUSES[0];
}

function priorityInfo(p: string) {
  return PRIORITIES.find((pr) => pr.value === p) || PRIORITIES[1];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

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

function Avatar({ user, size = 'sm' }: { user?: { displayName: string; avatarUrl: string | null }; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-8 w-8 text-xs' : 'h-6 w-6 text-[10px]';
  if (user?.avatarUrl) {
    return <img src={user.avatarUrl} alt={user.displayName} title={user.displayName} className={`${cls} rounded-full object-cover ring-1 ring-gray-200`} />;
  }
  return (
    <div title={user?.displayName || 'Anonymous'} className={`${cls} flex items-center justify-center rounded-full bg-blue-100 font-bold text-blue-600 ring-1 ring-blue-200`}>
      {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
    </div>
  );
}

export default function ThreadsPage() {
  const params = useParams();
  const projectSlug = params.projectSlug as string;

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>('member');
  const [threadList, setThreadList] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Detail panel
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const loadThreads = useCallback(
    async (proj: ProjectInfo) => {
      const p: Record<string, string> = {};
      if (statusFilter) p.status = statusFilter;
      if (priorityFilter) p.priority = priorityFilter;
      if (typeFilter) p.type = typeFilter;
      const list = await threads.list(proj.id, p);
      setThreadList(list);
    },
    [statusFilter, priorityFilter, typeFilter],
  );

  useEffect(() => {
    async function load() {
      try {
        const [, u] = await Promise.all([Promise.resolve(), auth.me()]);
        setCurrentUser(u);
        const orgList = await orgs.list();
        for (const org of orgList) {
          const projList = (await projects.list(org.id)) as ProjectInfo[];
          const found = projList.find((p) => p.slug === projectSlug);
          if (found) {
            setProject(found);
            setCurrentUserRole(found.currentUserRole || (org.role === 'owner' || org.role === 'admin' ? 'admin' : 'member'));
            await loadThreads(found);
            break;
          }
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectSlug, loadThreads]);

  useEffect(() => {
    if (project) loadThreads(project);
  }, [project, loadThreads]);

  async function openDetail(thread: Thread) {
    if (!project) return;
    setDetailLoading(true);
    setSelectedThread(thread);
    try {
      const full = await threads.get(project.id, thread.id);
      setSelectedThread(full);
    } catch { /* keep partial */ }
    finally { setDetailLoading(false); }
  }

  async function handleStatusChange(thread: Thread, newStatus: string) {
    if (!project) return;
    try {
      await threads.update(project.id, thread.id, { status: newStatus });
      await loadThreads(project);
      if (selectedThread?.id === thread.id) {
        setSelectedThread((prev) => prev ? { ...prev, status: newStatus } : null);
      }
    } catch { /* ignore */ }
  }

  async function handleResolveToggle(thread: Thread) {
    const newStatus = thread.status === 'resolved' ? 'open' : 'resolved';
    await handleStatusChange(thread, newStatus);
    showToast(newStatus === 'resolved' ? 'Thread resolved' : 'Thread reopened');
  }

  async function handleDeleteThread(thread: Thread) {
    if (!project) return;
    try {
      await threads.delete(project.id, thread.id);
      if (selectedThread?.id === thread.id) setSelectedThread(null);
      await loadThreads(project);
      showToast('Thread deleted');
    } catch { showToast('Failed to delete thread'); }
    setConfirmDelete(null);
  }

  async function handleCopyLink(thread: Thread) {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/p/${projectSlug}/threads/${thread.id}`
      );
      showToast('Link copied');
    } catch { showToast('Copy failed'); }
  }

  async function postReply() {
    if (!replyContent.trim() || replySending || !project || !selectedThread) return;
    setReplySending(true);
    try {
      await commentsApi.create(project.id, selectedThread.id, { content: replyContent.trim() });
      setReplyContent('');
      const full = await threads.get(project.id, selectedThread.id);
      setSelectedThread(full);
      await loadThreads(project);
    } catch { showToast('Failed to post reply'); }
    finally { setReplySending(false); }
  }

  async function saveEditComment(commentId: string) {
    if (!editContent.trim() || !project || !selectedThread) return;
    try {
      await commentsApi.update(project.id, selectedThread.id, commentId, { content: editContent.trim() });
      setEditingComment(null);
      showToast('Comment updated');
      const full = await threads.get(project.id, selectedThread.id);
      setSelectedThread(full);
    } catch { showToast('Failed to update comment'); }
  }

  async function deleteComment(commentId: string) {
    if (!project || !selectedThread) return;
    try {
      await commentsApi.delete(project.id, selectedThread.id, commentId);
      showToast('Comment deleted');
      const full = await threads.get(project.id, selectedThread.id);
      setSelectedThread(full);
      await loadThreads(project);
    } catch { showToast('Failed to delete comment'); }
  }

  if (loading) return <div className="text-gray-500">Loading threads...</div>;
  if (!project) return <div className="text-gray-500">Project not found.</div>;

  const isAdmin = currentUserRole === 'admin';
  const activeFilters = [statusFilter, priorityFilter, typeFilter].filter(Boolean).length;

  return (
    <div className="flex h-full gap-4">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-lg">
          {toast}
        </div>
      )}

      {/* Left: Thread List */}
      <div className={`min-w-0 ${selectedThread ? 'flex-1' : 'w-full'}`}>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Threads</h1>
          <span className="text-sm text-gray-500">{threadList.length} threads</span>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`rounded-md border px-3 py-1.5 text-sm ${statusFilter ? 'border-blue-300 bg-blue-50' : 'border-gray-300'}`}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className={`rounded-md border px-3 py-1.5 text-sm ${priorityFilter ? 'border-blue-300 bg-blue-50' : 'border-gray-300'}`}
          >
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={`rounded-md border px-3 py-1.5 text-sm ${typeFilter ? 'border-blue-300 bg-blue-50' : 'border-gray-300'}`}
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {activeFilters > 0 && (
            <button
              onClick={() => { setStatusFilter(''); setPriorityFilter(''); setTypeFilter(''); }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Thread cards */}
        {threadList.length === 0 ? (
          <div className="mt-12 text-center">
            <p className="text-gray-500">No threads found.</p>
            {activeFilters > 0 && (
              <button
                onClick={() => { setStatusFilter(''); setPriorityFilter(''); setTypeFilter(''); }}
                className="mt-2 text-sm text-blue-600 hover:text-blue-500"
              >
                Clear filters to see all threads
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {threadList.map((thread) => {
              const si = statusInfo(thread.status);
              const pi = priorityInfo(thread.priority);
              const isSelected = selectedThread?.id === thread.id;
              return (
                <button
                  key={thread.id}
                  onClick={() => openDetail(thread)}
                  className={`group flex w-full items-start gap-3 rounded-lg border bg-white p-4 text-left transition hover:shadow-sm ${
                    isSelected ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="shrink-0">
                    {thread.screenshotUrl ? (
                      <img src={thread.screenshotUrl} alt="" className="h-12 w-16 rounded border border-gray-200 object-cover" />
                    ) : (
                      <div className="flex h-12 w-16 items-center justify-center rounded border border-gray-200 bg-gray-50 text-lg">
                        {TYPE_ICONS[thread.type] || TYPE_ICONS.general}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-gray-900" dangerouslySetInnerHTML={renderWithMentions(thread.title)} />
                      <span className="shrink-0 text-xs text-gray-400">{timeAgo(thread.createdAt)}</span>
                    </div>
                    {thread.message && (
                      <p className="mt-0.5 line-clamp-1 text-sm text-gray-500" dangerouslySetInnerHTML={renderWithMentions(thread.message)} />
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${si.color}`}>
                        {si.label}
                      </span>
                      <span className={`text-xs font-medium ${pi.color}`}>{thread.priority}</span>
                      <span className="text-xs text-gray-400">{thread.type}</span>
                      {thread._count.comments > 0 && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                            <path d="M2.678 11.894a1 1 0 0 1 .287.801 10.97 10.97 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8.06 8.06 0 0 0 8 14c3.996 0 7-2.807 7-6 0-3.192-3.004-6-7-6S1 4.808 1 8c0 1.468.617 2.83 1.678 3.894z"/>
                          </svg>
                          {thread._count.comments}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Author */}
                  <div className="shrink-0">
                    <Avatar user={thread.author ?? undefined} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Thread Detail Panel */}
      {selectedThread && (
        <div className="flex w-[400px] shrink-0 flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="font-mono text-[10px] text-gray-400">#{selectedThread.id.slice(0, 8)}</span>
            <div className="flex items-center gap-1">
              {/* Copy link */}
              <button
                onClick={() => handleCopyLink(selectedThread)}
                className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                title="Copy link"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>
              {/* Resolve toggle — only for author or admin */}
              {(isAdmin || (currentUser && selectedThread.author?.id === currentUser.id)) && (
                <button
                  onClick={() => handleResolveToggle(selectedThread)}
                  className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
                    selectedThread.status === 'resolved'
                      ? 'border-green-600 bg-green-600 text-white hover:border-amber-500 hover:bg-amber-50 hover:text-amber-600'
                      : 'border-gray-300 text-gray-400 hover:border-green-600 hover:bg-green-50 hover:text-green-600'
                  }`}
                  title={selectedThread.status === 'resolved' ? 'Reopen' : 'Resolve'}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              )}
              {/* Thread menu — only for author or admin */}
              {(isAdmin || (currentUser && selectedThread.author?.id === currentUser.id)) && (
              <div className="relative">
                <button
                  onClick={() => setMenuOpenId(menuOpenId === 'thread' ? null : 'thread')}
                  className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  title="More actions"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
                  </svg>
                </button>
                {menuOpenId === 'thread' && (
                  <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    <button
                      onClick={() => { handleCopyLink(selectedThread); setMenuOpenId(null); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      Copy link
                    </button>
                    <button
                      onClick={() => { handleResolveToggle(selectedThread); setMenuOpenId(null); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {selectedThread.status === 'resolved' ? 'Reopen' : 'Resolve'}
                    </button>
                    <button
                      onClick={() => { setConfirmDelete(selectedThread.id); setMenuOpenId(null); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete thread
                    </button>
                  </div>
                )}
              </div>
              )}
              {/* Close */}
              <button
                onClick={() => setSelectedThread(null)}
                className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {detailLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
              </div>
            ) : (
              <>
                {/* Title + status */}
                <h2 className="text-lg font-semibold text-gray-900" dangerouslySetInnerHTML={renderWithMentions(selectedThread.title)} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {(isAdmin || (currentUser && selectedThread.author?.id === currentUser.id)) ? (
                    <select
                      value={selectedThread.status}
                      onChange={(e) => handleStatusChange(selectedThread, e.target.value)}
                      className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium ${statusInfo(selectedThread.status).color} cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo(selectedThread.status).color}`}>
                      {statusInfo(selectedThread.status).label}
                    </span>
                  )}
                  <span className={`text-xs font-medium ${priorityInfo(selectedThread.priority).color}`}>
                    {selectedThread.priority}
                  </span>
                  <span className="text-xs text-gray-400">{selectedThread.type}</span>
                  {selectedThread.viewport && selectedThread.viewport !== 'desktop' && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                      {selectedThread.viewport}
                    </span>
                  )}
                </div>

                {/* Author + message */}
                <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center gap-2">
                    <Avatar user={selectedThread.author ?? undefined} size="md" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{selectedThread.author?.displayName || 'Anonymous'}</p>
                      <p className="text-[10px] text-gray-400">{timeAgo(selectedThread.createdAt)}</p>
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800" dangerouslySetInnerHTML={renderWithMentions(selectedThread.message)} />
                </div>

                {/* Screenshot */}
                {selectedThread.screenshotUrl && (
                  <div className="mt-3">
                    <img
                      src={selectedThread.screenshotUrl}
                      alt="Screenshot"
                      className="w-full rounded-lg border border-gray-200 object-contain"
                    />
                  </div>
                )}

                {/* Page URL */}
                {selectedThread.pageUrl && (
                  <div className="mt-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Page</p>
                    <a
                      href={selectedThread.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 block truncate text-xs text-blue-600 hover:text-blue-500"
                    >
                      {selectedThread.pageUrl}
                    </a>
                  </div>
                )}

                {/* Comments */}
                <div className="mt-5">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Replies ({selectedThread.comments?.length || 0})
                  </h4>

                  {(!selectedThread.comments || selectedThread.comments.length === 0) ? (
                    <p className="mt-2 text-xs text-gray-400">No replies yet.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {selectedThread.comments.map((c: Comment) => {
                        const isOwn = currentUser && c.author?.id === currentUser.id;
                        const canEditComment = !!isOwn;
                        const canDeleteComment = !!isOwn || isAdmin;
                        return (
                          <div key={c.id} className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
                            <div className="flex items-start justify-between gap-1">
                              <div className="flex items-center gap-2">
                                <Avatar user={c.author ?? undefined} />
                                <div>
                                  <p className="text-xs font-medium text-gray-900">{c.author?.displayName || 'Unknown'}</p>
                                  <p className="text-[10px] text-gray-400">{timeAgo(c.createdAt)}</p>
                                </div>
                              </div>
                              {(canEditComment || canDeleteComment) && (
                                <div className="flex shrink-0 gap-0.5">
                                  {canEditComment && (
                                    <button
                                      onClick={() => { setEditingComment(c.id); setEditContent(c.content); }}
                                      className="flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:bg-gray-200 hover:text-gray-600"
                                      title="Edit"
                                    >
                                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                  )}
                                  {canDeleteComment && (
                                    <button
                                      onClick={() => deleteComment(c.id)}
                                      className="flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:bg-red-50 hover:text-red-500"
                                      title="Delete"
                                    >
                                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            {editingComment === c.id ? (
                              <div className="mt-1.5">
                                <textarea
                                  value={editContent}
                                  onChange={(e) => setEditContent(e.target.value)}
                                  rows={2}
                                  className="w-full resize-none rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                                  autoFocus
                                />
                                <div className="mt-1 flex gap-2">
                                  <button onClick={() => setEditingComment(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                                  <button onClick={() => saveEditComment(c.id)} className="text-xs font-medium text-blue-600 hover:text-blue-800">Save</button>
                                </div>
                              </div>
                            ) : (
                              <p className="mt-1.5 whitespace-pre-wrap text-sm text-gray-700" dangerouslySetInnerHTML={renderWithMentions(c.content)} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Reply form */}
          <div className="shrink-0 border-t border-gray-100 px-4 py-3">
            <div className="relative">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Reply..."
                rows={2}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postReply();
                }}
              />
              <button
                onClick={postReply}
                disabled={!replyContent.trim() || replySending}
                className="absolute bottom-2.5 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-30"
                title="Send (Ctrl+Enter)"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900">Delete thread?</h3>
            <p className="mt-2 text-sm text-gray-500">This will permanently delete this thread and all its comments. This cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const t = threadList.find((t) => t.id === confirmDelete);
                  if (t) handleDeleteThread(t);
                }}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
