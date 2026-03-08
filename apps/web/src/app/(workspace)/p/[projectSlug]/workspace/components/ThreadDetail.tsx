'use client';

import { useState, useCallback, useEffect } from 'react';
import { Thread, Comment, User, threads as threadsApi, comments as commentsApi, attachments as attachmentsApi } from '@/lib/api';
import type { StagedFile } from './Composer';
import AuthorMeta from './AuthorMeta';
import MoreMenu, { MenuItem } from './MoreMenu';
import { IconBack, IconCheck, IconSend, IconLink, IconTrash, IconInfo, IconPencil, IconImage } from './Icons';
import Composer from './Composer';
import { copyToClipboard } from '../lib/utils';
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

interface ThreadDetailProps {
  thread: Thread;
  projectId: string;
  currentUser: User | null;
  onBack: () => void;
  onResolve: (thread: Thread) => void;
  onDelete: (thread: Thread) => void;
  onRefresh: () => void;
  onShowEnv: (env: Record<string, unknown>, rect: DOMRect) => void;
  showToast: (msg: string) => void;
}

export default function ThreadDetail({
  thread: initialThread,
  projectId,
  currentUser,
  onBack,
  onResolve,
  onDelete,
  onRefresh,
  onShowEnv,
  showToast,
}: ThreadDetailProps) {
  const [thread, setThread] = useState<Thread>(initialThread);
  const [replyContent, setReplyContent] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [editingReply, setEditingReply] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Check if current user can edit this comment
  const canEditComment = useCallback((comment: Comment) => {
    return currentUser && comment.author?.id === currentUser.id;
  }, [currentUser]);

  const loadThread = useCallback(async () => {
    try {
      const full = await threadsApi.get(projectId, thread.id);
      setThread(full);
    } catch { /* keep stale */ }
  }, [projectId, thread.id]);

  // Load full thread data (with attachments, comments) on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadThread(); }, [loadThread]);

  async function postReply(contentArg?: string, files?: StagedFile[]) {
    const content = (contentArg || replyContent).trim();
    if (!content || replySending) return;
    setReplySending(true);
    
    // Optimistically add the comment immediately for live update
    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const optimisticComment = {
      id: tempId,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: currentUser ? {
        id: currentUser.id,
        email: currentUser.email,
        displayName: currentUser.displayName,
        avatarUrl: currentUser.avatarUrl,
      } : {
        id: 'current-user',
        email: 'user@example.com',
        displayName: 'You',
        avatarUrl: null,
      },
    };
    setThread((prev) => ({
      ...prev,
      comments: [...(prev.comments || []), optimisticComment],
      _count: { comments: (prev._count?.comments || 0) + 1 },
    }));
    setReplyContent('');
    
    try {
      console.log('💬 Creating comment in ThreadDetail:', { projectId, threadId: thread.id, content });
      const result = await commentsApi.create(projectId, thread.id, { content });
      console.log('✅ Comment created in ThreadDetail:', result);

      // Upload staged files as comment attachments
      if (files && files.length > 0 && result?.id) {
        for (const sf of files) {
          try {
            await attachmentsApi.uploadFile(sf.file, 'comment', result.id);
          } catch (err) {
            console.error('Failed to upload reply attachment:', err);
          }
        }
      }

      // Refresh to get real comment data + attachments
      loadThread();
      onRefresh();
    } catch {
      showToast('Failed to post reply');
      // Remove optimistic comment on error
      setThread((prev) => ({
        ...prev,
        comments: prev.comments?.filter((c) => c.id !== optimisticComment.id) || [],
        _count: { comments: Math.max(0, (prev._count?.comments || 0) - 1) },
      }));
    } finally {
      setReplySending(false);
    }
  }

  async function saveEditReply(commentId: string) {
    if (!editContent.trim()) return;
    try {
      await commentsApi.update(projectId, thread.id, commentId, { content: editContent.trim() });
      setEditingReply(null);
      showToast('Comment updated');
      await loadThread();
    } catch {
      showToast('Failed to update comment');
    }
  }

  async function deleteReply(commentId: string) {
    try {
      await commentsApi.delete(projectId, thread.id, commentId);
      showToast('Comment deleted');
      await loadThread();
      onRefresh();
    } catch {
      showToast('Failed to delete comment');
    }
  }

  const menuItems: MenuItem[] = [
    {
      label: 'Copy link',
      icon: <IconLink />,
      action: () =>
        copyToClipboard(`${window.location.origin}${window.location.pathname}?thread=${thread.id}&viewport=${thread.viewport || 'desktop'}`)
          .then(() => showToast('Link copied'))
          .catch(() => showToast('Copy failed')),
    },
  ];
  if (thread.environment) {
    menuItems.push({
      label: 'Environment',
      icon: <IconInfo />,
      action: () => onShowEnv(thread.environment as Record<string, unknown>, new DOMRect()),
    });
  }
  menuItems.push({
    label: 'Delete thread',
    icon: <IconTrash />,
    danger: true,
    action: () => onDelete(thread),
  });

  return (
    <div className="flex h-full flex-col">
      {/* Back + actions */}
      <div className="shrink-0 border-b border-gray-100 px-3 py-2">
        <button
          onClick={onBack}
          className="mb-2 flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
        >
          <IconBack /> Back
        </button>
        <div className="flex items-center gap-1">
          <span className="mr-auto font-mono text-[10px] text-gray-400">#{thread.id.slice(0, 8)}</span>
          <MoreMenu items={menuItems} />
          <button
            onClick={() => onResolve(thread)}
            className={`flex h-6 w-6 items-center justify-center rounded-full border transition ${
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

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {/* Original message */}
        <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
          <AuthorMeta
            displayName={thread.author?.displayName}
            avatarUrl={thread.author?.avatarUrl}
            createdAt={thread.createdAt}
          />
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{renderWithMentions(thread.message)}</p>
          {/* Screenshot preview */}
          {thread.screenshotUrl && (
            <div className="mt-2 rounded-lg overflow-hidden border border-gray-200">
              <img
                src={thread.screenshotUrl}
                alt="Screenshot"
                className="w-full cursor-pointer hover:opacity-90 transition"
                onClick={() => window.open(thread.screenshotUrl!, '_blank')}
              />
            </div>
          )}
          {/* Attachments */}
          {thread.attachments && thread.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {thread.attachments.filter(a => !thread.screenshotUrl || a.url !== thread.screenshotUrl).map((att) => (
                att.mimeType.startsWith('image/') ? (
                  <div key={att.id} className="rounded-lg overflow-hidden border border-gray-200 cursor-pointer hover:opacity-90 transition" style={{ maxWidth: '200px' }}>
                    <img src={att.url} alt={att.filename} className="w-full object-cover" onClick={() => window.open(att.url, '_blank')} />
                  </div>
                ) : (
                  <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 transition">
                    📎 {att.filename}
                  </a>
                )
              ))}
            </div>
          )}
        </div>

        {/* Replies */}
        <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Replies ({thread.comments?.length || 0})
        </h4>

        {(!thread.comments || thread.comments.length === 0) ? (
          <p className="text-xs text-gray-400">No replies yet.</p>
        ) : (
          <div className="space-y-3">
            {thread.comments.map((c: Comment) => (
              <div key={c.id} className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
                <div className="flex items-start justify-between gap-1">
                  <AuthorMeta
                    displayName={c.author?.displayName}
                    avatarUrl={c.author?.avatarUrl}
                    createdAt={c.createdAt}
                  />
                  {canEditComment(c) && (
                    <div className="flex shrink-0 gap-0.5">
                      <button
                        onClick={() => { setEditingReply(c.id); setEditContent(c.content); }}
                        className="flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:bg-gray-200 hover:text-gray-600"
                        title="Edit"
                      >
                        <IconPencil />
                      </button>
                      <button
                        onClick={() => deleteReply(c.id)}
                        className="flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:bg-red-50 hover:text-red-500"
                        title="Delete"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  )}
                </div>
                {editingReply === c.id ? (
                  <div className="mt-1.5">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={2}
                      className="w-full resize-none rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                      autoFocus
                    />
                    <div className="mt-1 flex gap-2">
                      <button onClick={() => setEditingReply(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                      <button onClick={() => saveEditReply(c.id)} className="text-xs font-medium text-blue-600 hover:text-blue-800">Save</button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-gray-700">{renderWithMentions(c.content)}</p>
                )}
                {/* Comment attachments */}
                {c.attachments && c.attachments.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.attachments.map((att) => (
                      att.mimeType?.startsWith('image/') ? (
                        <div key={att.id} className="rounded-lg overflow-hidden border border-gray-200 cursor-pointer hover:opacity-90 transition" style={{ maxWidth: '160px' }}>
                          <img src={att.url} alt={att.filename} className="w-full object-cover" onClick={() => window.open(att.url, '_blank')} />
                        </div>
                      ) : (
                        <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 transition">
                          📎 {att.filename}
                        </a>
                      )
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reply form */}
      <div className="shrink-0 border-t border-gray-100 px-3 py-2">
        <Composer
          placeholder="Reply…"
          projectId={projectId}
          onSubmit={(content, files) => postReply(content, files)}
          sending={replySending}
          onContentChange={(has) => setReplyContent(has ? ' ' : '')}
        />
      </div>
    </div>
  );
}
