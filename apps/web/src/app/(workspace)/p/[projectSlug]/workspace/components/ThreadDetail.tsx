'use client';

import { useState, useCallback } from 'react';
import { Thread, Comment, User, threads as threadsApi, comments as commentsApi } from '@/lib/api';
import AuthorMeta from './AuthorMeta';
import MoreMenu, { MenuItem } from './MoreMenu';
import { IconBack, IconCheck, IconSend, IconLink, IconTrash, IconInfo, IconPencil } from './Icons';
import { copyToClipboard } from '../lib/utils';

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

  async function postReply() {
    if (!replyContent.trim() || replySending) return;
    setReplySending(true);
    const content = replyContent.trim();
    
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
      // Refresh in background to get real comment data
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
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{thread.message}</p>
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
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-gray-700">{c.content}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reply form */}
      <div className="shrink-0 border-t border-gray-100 px-3 py-2">
        <div className="relative">
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Reply…"
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
          >
            <IconSend />
          </button>
        </div>
      </div>
    </div>
  );
}
