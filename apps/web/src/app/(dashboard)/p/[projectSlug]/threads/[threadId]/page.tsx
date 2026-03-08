'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { threads, comments, orgs, projects, Thread, Comment } from '@/lib/api';
import React from 'react';

/** Render text with @[Name](id) mentions styled as blue inline badges */
function renderWithMentions(text: string): React.ReactNode {
  const mentionRegex = /@\[([^\]]+)\]\([^)]+\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={key++} className="inline-flex items-center rounded bg-blue-100 px-1 py-0.5 text-xs font-medium text-blue-700">
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
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
          <h1 className="text-xl font-bold text-gray-900">{renderWithMentions(thread.title)}</h1>
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

        <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">{renderWithMentions(thread.message)}</p>

        {thread.screenshotUrl && (
          <div className="mt-4">
            <img
              src={thread.screenshotUrl}
              alt="Screenshot"
              className="max-w-full rounded border border-gray-200"
            />
          </div>
        )}

        <div className="mt-4 flex items-center gap-4 border-t border-gray-200 pt-4 text-xs text-gray-500">
          <span>By {thread.author?.displayName || 'Anonymous'}</span>
          <span>{new Date(thread.createdAt).toLocaleString()}</span>
          <a
            href={thread.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-blue-600 hover:underline"
          >
            {thread.pageUrl}
          </a>
        </div>

        {thread.environment && (() => {
          const env = thread.environment as unknown as ThreadEnv;
          return (
            <div className="mt-3 rounded bg-gray-50 p-3 text-xs text-gray-500">
              <span className="font-medium">Environment:</span> {env.browserName}{' '}
              {env.browserVersion} &middot; {env.osName} &middot;{' '}
              {env.viewportWidth}&times;{env.viewportHeight}
            </div>
          );
        })()}

        {thread.xPct != null && thread.yPct != null && (
          <div className="mt-2 text-xs text-gray-400">
            Pin: {thread.xPct.toFixed(2)}% x {thread.yPct.toFixed(2)}%
          </div>
        )}
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
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{renderWithMentions(comment.content)}</p>
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
