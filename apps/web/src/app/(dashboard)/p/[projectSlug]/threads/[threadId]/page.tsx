'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { threads, comments, orgs, projects, Thread, Comment } from '@/lib/api';
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

interface ThreadEnv {
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  viewportWidth?: number;
  viewportHeight?: number;
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-600',
};

function ScreenshotWithPin({ url, xPct, yPct }: {
  url: string; xPct?: number | null; yPct?: number | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-gray-200">
      <img src={url} alt="Screenshot" className="w-full object-contain" />
      {xPct != null && yPct != null && (
        <div
          className="absolute z-10"
          style={{ left: `${xPct}%`, top: `${yPct}%`, transform: 'translate(-50%, -100%)' }}
        >
          <svg viewBox="0 0 24 36" width="24" height="36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0zm0 16.5c-2.48 0-4.5-2.02-4.5-4.5S9.52 7.5 12 7.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5z" fill="#2563eb"/>
            <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0zm0 16.5c-2.48 0-4.5-2.02-4.5-4.5S9.52 7.5 12 7.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5z" fill="none" stroke="#fff" strokeWidth="1.5"/>
          </svg>
        </div>
      )}
    </div>
  );
}

function Avatar({ name, avatarUrl }: { name?: string; avatarUrl?: string | null }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name || ''} className="h-8 w-8 rounded-full object-cover ring-1 ring-gray-200" />;
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600 ring-1 ring-blue-200">
      {name?.charAt(0)?.toUpperCase() || '?'}
    </div>
  );
}

export default function ThreadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectSlug = params.projectSlug as string;
  const threadId = params.threadId as string;

  const [projectId, setProjectId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [commentList, setCommentList] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadComments = useCallback(
    async (pid: string) => {
      const list = (await comments.list(pid, threadId)) as unknown as Comment[];
      setCommentList(list);
    },
    [threadId],
  );

  useEffect(() => {
    async function load() {
      try {
        const orgList = await orgs.list();
        for (const org of orgList) {
          const projList = (await projects.list(org.id)) as { id: string; slug: string }[];
          const found = projList.find((p) => p.slug === projectSlug);
          if (found) {
            setProjectId(found.id);
            const t = await threads.get(found.id, threadId);
            setThread(t);
            await loadComments(found.id);
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
  }, [projectSlug, threadId, loadComments]);

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !newComment.trim()) return;
    setSubmitting(true);
    try {
      await comments.create(projectId, threadId, { content: newComment.trim() });
      setNewComment('');
      await loadComments(projectId);
    } catch {
      /* ignore */
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-gray-500">Loading...</div>;
  if (!thread) return <div className="text-gray-500">Thread not found.</div>;

  return (
    <div className="mx-auto max-w-3xl">
      <button
        onClick={() => router.push(`/p/${projectSlug}/threads`)}
        className="mb-4 text-sm text-blue-600 hover:text-blue-500"
      >
        &larr; Back to threads
      </button>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <h1 className="text-xl font-bold text-gray-900" dangerouslySetInnerHTML={renderWithMentions(thread.title)} />
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[thread.status] || ''}`}
          >
            {thread.status}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {thread.priority}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {thread.type}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {thread.contextType}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {thread.viewport}
          </span>
          {(thread as Thread & { createdVia?: string }).createdVia && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              via {(thread as Thread & { createdVia?: string }).createdVia}
            </span>
          )}
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700" dangerouslySetInnerHTML={renderWithMentions(thread.message)} />

        {/* Author info */}
        <div className="mt-4 flex items-center gap-3 border-t border-gray-200 pt-4">
          <Avatar name={thread.author?.displayName} avatarUrl={thread.author?.avatarUrl} />
          <div>
            <p className="text-sm font-medium text-gray-900">{thread.author?.displayName || 'Anonymous'}</p>
            <p className="text-xs text-gray-400">{new Date(thread.createdAt).toLocaleString()}</p>
          </div>
        </div>

        {/* Screenshot with pin marker */}
        {thread.screenshotUrl && (
          <div className="mt-4">
            <ScreenshotWithPin
              url={thread.screenshotUrl}
              xPct={thread.xPct}
              yPct={thread.yPct}
            />
          </div>
        )}

        {/* Page + workspace link */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {thread.pageUrl && (
            <a
              href={thread.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-500"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {thread.pageUrl}
            </a>
          )}
          {thread.pageUrl && (
            <a
              href={`/p/${projectSlug}/workspace?thread=${thread.id}&viewport=${thread.viewport || 'desktop'}`}
              className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              View in workspace
            </a>
          )}
        </div>

        {/* Environment details */}
        {thread.environment && (() => {
          const env = thread.environment as unknown as ThreadEnv;
          return (
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3">
              {env.browserName && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Browser</p>
                  <p className="text-xs text-gray-600">{env.browserName} {env.browserVersion}</p>
                </div>
              )}
              {env.osName && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">OS</p>
                  <p className="text-xs text-gray-600">{env.osName}</p>
                </div>
              )}
              {env.viewportWidth && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Viewport</p>
                  <p className="text-xs text-gray-600">{env.viewportWidth}&times;{env.viewportHeight}</p>
                </div>
              )}
              {thread.viewport && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Device</p>
                  <p className="text-xs text-gray-600 capitalize">{thread.viewport}</p>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Comments */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-gray-900">Comments ({commentList.length})</h2>

        {commentList.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No comments yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {commentList.map((comment) => (
              <div key={comment.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-medium text-gray-700">
                    {comment.author?.displayName || 'Anonymous'}
                  </span>
                  <span>{new Date(comment.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700" dangerouslySetInnerHTML={renderWithMentions(comment.content)} />
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmitComment} className="mt-4">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            rows={3}
            className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={submitting || !newComment.trim()}
            className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Posting...' : 'Post comment'}
          </button>
        </form>
      </div>
    </div>
  );
}
