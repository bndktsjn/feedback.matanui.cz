'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { threads, orgs, projects, Thread } from '@/lib/api';
import React from 'react';

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

interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
  orgId: string;
}

const COLUMNS = [
  { status: 'open', label: 'Open', color: '#22c55e', bgColor: 'bg-green-50', headerBg: 'bg-green-100' },
  { status: 'in_progress', label: 'In Progress', color: '#eab308', bgColor: 'bg-yellow-50', headerBg: 'bg-yellow-100' },
  { status: 'resolved', label: 'Resolved', color: '#3b82f6', bgColor: 'bg-blue-50', headerBg: 'bg-blue-100' },
  { status: 'closed', label: 'Closed', color: '#9ca3af', bgColor: 'bg-gray-50', headerBg: 'bg-gray-100' },
];

const PRIORITY_BORDER: Record<string, string> = {
  low: 'border-l-gray-300',
  medium: 'border-l-blue-400',
  high: 'border-l-orange-400',
  critical: 'border-l-red-500',
};

const TYPE_ICONS: Record<string, string> = {
  bug: '\uD83D\uDC1B',
  design: '\uD83C\uDFA8',
  content: '\uD83D\uDCDD',
  general: '\uD83D\uDCAC',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function KanbanPage() {
  const params = useParams();
  const projectSlug = params.projectSlug as string;

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [allThreads, setAllThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const loadThreads = useCallback(async (proj: ProjectInfo) => {
    const list = await threads.list(proj.id, { per_page: '200' });
    setAllThreads(list);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const orgList = await orgs.list();
        for (const org of orgList) {
          const projList = (await projects.list(org.id)) as ProjectInfo[];
          const found = projList.find((p) => p.slug === projectSlug);
          if (found) {
            setProject(found);
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

  async function handleDrop(threadId: string, newStatus: string) {
    if (!project) return;
    // Optimistic update
    setAllThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, status: newStatus } : t)),
    );
    try {
      await threads.update(project.id, threadId, { status: newStatus });
    } catch {
      // Revert on failure
      await loadThreads(project);
    }
  }

  if (loading) return <div className="text-gray-500">Loading board...</div>;
  if (!project) return <div className="text-gray-500">Project not found.</div>;

  const threadsByStatus: Record<string, Thread[]> = {};
  for (const col of COLUMNS) {
    threadsByStatus[col.status] = allThreads.filter((t) => t.status === col.status);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Board</h1>
        <span className="text-sm text-gray-500">{allThreads.length} threads</span>
      </div>

      <div className="mt-4 flex flex-1 gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colThreads = threadsByStatus[col.status] || [];
          const isOver = dragOver === col.status;
          return (
            <div
              key={col.status}
              className="w-72 flex-shrink-0"
              onDragOver={(e) => { e.preventDefault(); setDragOver(col.status); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                if (dragging) {
                  handleDrop(dragging, col.status);
                  setDragging(null);
                }
              }}
            >
              <div className={`rounded-lg ${isOver ? 'ring-2 ring-blue-400' : ''}`}>
                {/* Column header */}
                <div className={`flex items-center justify-between rounded-t-lg px-3 py-2.5 ${col.headerBg}`}>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: col.color }}
                    />
                    <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                  </div>
                  <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {colThreads.length}
                  </span>
                </div>

                {/* Cards */}
                <div className={`min-h-[200px] space-y-2 rounded-b-lg p-2 ${col.bgColor}`}>
                  {colThreads.map((thread) => (
                    <ThreadCard
                      key={thread.id}
                      thread={thread}
                      projectSlug={projectSlug}
                      onDragStart={() => setDragging(thread.id)}
                      onDragEnd={() => { setDragging(null); setDragOver(null); }}
                      isDragging={dragging === thread.id}
                    />
                  ))}
                  {colThreads.length === 0 && (
                    <div className="flex h-24 items-center justify-center">
                      <p className="text-xs text-gray-400">No threads</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ThreadCard({
  thread,
  projectSlug,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  thread: Thread;
  projectSlug: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-md border-l-4 bg-white p-3 shadow-sm transition active:cursor-grabbing ${
        PRIORITY_BORDER[thread.priority] || 'border-l-gray-300'
      } ${isDragging ? 'opacity-40' : 'hover:shadow-md'}`}
    >
      <Link
        href={`/p/${projectSlug}/threads/${thread.id}`}
        className="block text-sm font-medium text-gray-900 hover:text-blue-600"
      >
        <span dangerouslySetInnerHTML={renderWithMentions(thread.title)} />
      </Link>

      {thread.message && (
        <p className="mt-1 line-clamp-2 text-xs text-gray-500" dangerouslySetInnerHTML={renderWithMentions(thread.message)} />
      )}

      {thread.screenshotUrl && (
        <img
          src={thread.screenshotUrl}
          alt=""
          className="mt-2 h-20 w-full rounded border border-gray-200 object-cover"
        />
      )}

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs" title={thread.type}>
            {TYPE_ICONS[thread.type] || TYPE_ICONS.general}
          </span>
          <span className={`text-[10px] font-medium ${
            thread.priority === 'critical' ? 'text-red-600'
            : thread.priority === 'high' ? 'text-orange-600'
            : thread.priority === 'medium' ? 'text-blue-600'
            : 'text-gray-400'
          }`}>
            {thread.priority}
          </span>
          {thread._count.comments > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                <path d="M2.678 11.894a1 1 0 0 1 .287.801 10.97 10.97 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8.06 8.06 0 0 0 8 14c3.996 0 7-2.807 7-6 0-3.192-3.004-6-7-6S1 4.808 1 8c0 1.468.617 2.83 1.678 3.894z"/>
              </svg>
              {thread._count.comments}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">{timeAgo(thread.createdAt)}</span>
          {thread.author?.avatarUrl ? (
            <img
              src={thread.author.avatarUrl}
              alt={thread.author.displayName}
              title={thread.author.displayName}
              className="h-5 w-5 rounded-full object-cover"
            />
          ) : (
            <div
              title={thread.author?.displayName || 'Anonymous'}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[8px] font-bold text-blue-600"
            >
              {thread.author?.displayName?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
