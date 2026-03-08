'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Thread, Comment, User, threads as threadsApi, comments as commentsApi } from '@/lib/api';
import AuthorMeta from './AuthorMeta';
import ThreadMenu from './ThreadMenu';
import { IconClose, IconCheck, IconSend, IconPencil, IconTrash, IconImage } from './Icons';
import Composer from './Composer';
import type { StagedFile } from './Composer';
import ScreenshotEditor from './ScreenshotEditor';
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

/* ── Preview popover (hover) ─────────────────────────────────── */

interface PreviewPopoverProps {
  thread: Thread;
  pinRect: DOMRect;
  panelOpen: boolean;
}

export function PreviewPopover({ thread, pinRect, panelOpen }: PreviewPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const pop = ref.current.getBoundingClientRect();
    const panelW = panelOpen ? 320 : 0;
    let left = pinRect.right + 8;
    if (left + pop.width > window.innerWidth - panelW - 8) {
      left = pinRect.left - pop.width - 8;
    }
    let top = pinRect.top - 20;
    if (top + pop.height > window.innerHeight - 8) top = window.innerHeight - pop.height - 8;
    if (top < 8) top = 8;
    setStyle({ top, left, opacity: 1 });
  }, [pinRect, panelOpen]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[99990] w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-xl pointer-events-none"
      style={style}
    >
      <AuthorMeta
        displayName={thread.author?.displayName}
        avatarUrl={thread.author?.avatarUrl}
        guestEmail={thread.guestEmail}
        createdAt={thread.createdAt}
      />
      <p className="mt-1.5 text-xs text-gray-700 line-clamp-3">{renderWithMentions(thread.message)}</p>
      {thread._count.comments > 0 && (
        <p className="mt-1 text-[10px] text-gray-400">
          {thread._count.comments} {thread._count.comments === 1 ? 'reply' : 'replies'}
        </p>
      )}
    </div>,
    document.body
  );
}

/* ── Full thread popover (click) ─────────────────────────────── */

interface ThreadPopoverProps {
  thread: Thread;
  projectId: string;
  pinRect: DOMRect;
  panelOpen: boolean;
  currentUser: User | null;
  isAnonymous?: boolean;
  guestEmail?: string;
  onClose: () => void;
  onResolve: (thread: Thread) => void;
  onDelete: (thread: Thread) => void;
  onRefresh: () => void;
  onShowEnv: (env: Record<string, unknown>, rect: DOMRect) => void;
  showToast: (msg: string) => void;
}

export function ThreadPopover({
  thread: initialThread,
  projectId,
  pinRect,
  panelOpen,
  currentUser,
  isAnonymous = false,
  guestEmail = '',
  onClose,
  onResolve,
  onDelete,
  onRefresh,
  onShowEnv,
  showToast,
}: ThreadPopoverProps) {
  const [thread, setThread] = useState<Thread>(initialThread);
  const [replyContent, setReplyContent] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [editingReply, setEditingReply] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [shaking, setShaking] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });
  const [showScreenshotEditor, setShowScreenshotEditor] = useState(false);
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Load screenshot blob for editing when requested
  useEffect(() => {
    if (showScreenshotEditor && thread.screenshotUrl && !screenshotBlob) {
      fetch(thread.screenshotUrl)
        .then((r) => r.blob())
        .then(setScreenshotBlob)
        .catch(() => { showToast('Failed to load screenshot'); setShowScreenshotEditor(false); });
    }
  }, [showScreenshotEditor, thread.screenshotUrl, screenshotBlob, showToast]);

  async function handleScreenshotSave(editedBlob: Blob) {
    setShowScreenshotEditor(false);
    setScreenshotBlob(null);
    try {
      const { attachments: attachmentsApi } = await import('@/lib/api');
      const file = new File([editedBlob], 'screenshot-edited.png', { type: 'image/png' });
      const uploaded = await attachmentsApi.uploadFile(file, 'thread', thread.id);
      await threadsApi.update(projectId, thread.id, { screenshotUrl: uploaded.url });
      showToast('Screenshot updated');
      loadThread();
      onRefresh();
    } catch {
      showToast('Failed to save screenshot');
    }
  }

  async function handleScreenshotDelete() {
    setShowScreenshotEditor(false);
    setScreenshotBlob(null);
    try {
      await threadsApi.update(projectId, thread.id, { screenshotUrl: null });
      showToast('Screenshot removed');
      loadThread();
      onRefresh();
    } catch {
      showToast('Failed to remove screenshot');
    }
  }

  // 3.1: Guard close — shake if unsaved reply text
  const guardedClose = useCallback(() => {
    if (replyContent.trim()) {
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
      return;
    }
    onClose();
  }, [replyContent, onClose]);

  // Check if current user can edit this comment
  const canEditComment = useCallback((comment: Comment) => {
    return currentUser && comment.author?.id === currentUser.id;
  }, [currentUser]);

  // Fetch full thread data (with comments)
  const loadThread = useCallback(async () => {
    try {
      const full = await threadsApi.get(projectId, initialThread.id);
      setThread(full);
    } catch { /* keep stale */ }
  }, [projectId, initialThread.id]);

  useEffect(() => { loadThread(); }, [loadThread]);

  // Position popover
  useEffect(() => {
    if (!ref.current) return;
    const pop = ref.current.getBoundingClientRect();
    const panelW = panelOpen ? 320 : 0;
    let left = pinRect.right + 8;
    if (left + pop.width > window.innerWidth - panelW - 8) {
      left = Math.max(8, pinRect.left - pop.width - 8);
    }
    let top = pinRect.top - 20;
    if (top + pop.height > window.innerHeight - 8) top = window.innerHeight - pop.height - 8;
    if (top < 8) top = 8;
    setStyle({ top, left, opacity: 1 });
  }, [pinRect, panelOpen, thread]);

  // Close on Escape (guarded)
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') guardedClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [guardedClose]);

  async function postReply(contentArg?: string) {
    const content = (contentArg || replyContent).trim();
    if (!content || replySending) return;
    setReplySending(true);
    
    // Optimistically add the comment immediately for live update
    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const optimisticComment: Comment = {
      id: tempId,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: currentUser ? {
        id: currentUser.id,
        email: currentUser.email,
        displayName: currentUser.displayName,
        avatarUrl: currentUser.avatarUrl,
      } : null,
      guestEmail: isAnonymous ? guestEmail : undefined,
    };
    setThread((prev) => ({
      ...prev,
      comments: [...(prev.comments || []), optimisticComment],
      _count: { comments: (prev._count?.comments || 0) + 1 },
    }));
    setReplyContent('');
    
    try {
      console.log('💬 Creating comment:', { projectId, threadId: thread.id, content });
      const commentData: { content: string; guestEmail?: string } = { content };
      if (isAnonymous && guestEmail) commentData.guestEmail = guestEmail.toLowerCase();
      const result = await commentsApi.create(projectId, thread.id, commentData);
      console.log('✅ Comment created:', result);
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

  return (<>
    {createPortal(
      <div
        ref={ref}
        className={`fixed z-[99991] flex w-80 flex-col rounded-xl border border-gray-200 bg-white shadow-2xl ${shaking ? 'animate-shake' : ''}`}
        style={{ ...style, maxHeight: 'calc(100vh - 32px)', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-1 border-b border-gray-100 px-3 py-2">
          <span className="mr-auto text-[10px] font-mono text-gray-400">#{thread.id.slice(0, 8)}</span>
          {!isAnonymous && (
            <>
              <ThreadMenu
                thread={thread}
                onResolve={onResolve}
                onDelete={onDelete}
                onShowEnv={onShowEnv}
                showToast={showToast}
                anchorRef={ref}
              />
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
            </>
          )}
          <button onClick={guardedClose} className="text-gray-400 hover:text-gray-600 ml-1">
            <IconClose />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Original message */}
          <div className="px-3 pt-3 pb-2">
            <AuthorMeta
              displayName={thread.author?.displayName}
              avatarUrl={thread.author?.avatarUrl}
              guestEmail={thread.guestEmail}
              createdAt={thread.createdAt}
            />
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-gray-800">{renderWithMentions(thread.message)}</p>
            {/* Screenshot preview */}
            {thread.screenshotUrl && (
              <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 relative group">
                <img
                  src={thread.screenshotUrl}
                  alt="Screenshot"
                  className="w-full cursor-pointer hover:opacity-90 transition"
                  onClick={() => window.open(thread.screenshotUrl!, '_blank')}
                />
                <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowScreenshotEditor(true); }}
                    className="flex h-5 w-5 items-center justify-center rounded bg-white/90 text-gray-500 hover:text-blue-600 shadow-sm"
                    title="Edit screenshot"
                  >
                    <IconPencil />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Replies */}
          {thread.comments && thread.comments.length > 0 && (
            <div className="border-t border-gray-100 px-3 py-2">
              <div className="space-y-3">
                {thread.comments.map((c: Comment) => (
                  <div key={c.id}>
                    <div className="flex items-start justify-between gap-1">
                      <AuthorMeta
                        displayName={c.author?.displayName}
                        avatarUrl={c.author?.avatarUrl}
                        guestEmail={c.guestEmail}
                        createdAt={c.createdAt}
                      />
                      {canEditComment(c) && (
                        <div className="flex shrink-0 gap-0.5">
                          <button
                            onClick={() => { setEditingReply(c.id); setEditContent(c.content); }}
                            className="flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:bg-gray-100 hover:text-gray-600"
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
                      <div className="mt-1">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={2}
                          className="w-full resize-none rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                          autoFocus
                        />
                        <div className="mt-1 flex gap-1.5">
                          <button
                            onClick={() => setEditingReply(null)}
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveEditReply(c.id)}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{renderWithMentions(c.content)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(!thread.comments || thread.comments.length === 0) && (
            <p className="px-3 py-2 text-xs text-gray-400">No replies yet.</p>
          )}
        </div>

        {/* Reply form — hidden for view-only anonymous users */}
        {(!isAnonymous || guestEmail) && (
          <div className="shrink-0 border-t border-gray-100 px-3 py-2">
            {isAnonymous && !guestEmail.trim() ? (
              <p className="text-xs text-gray-400 text-center py-1">Enter your email above to reply</p>
            ) : (
              <Composer
                placeholder="Reply…"
                projectId={projectId}
                onSubmit={(content) => postReply(content)}
                sending={replySending}
                onContentChange={(has) => setReplyContent(has ? ' ' : '')}
              />
            )}
          </div>
        )}
      </div>,
      document.body
    )}

    {showScreenshotEditor && screenshotBlob && (
      <ScreenshotEditor
        imageBlob={screenshotBlob}
        onSave={handleScreenshotSave}
        onCancel={() => { setShowScreenshotEditor(false); setScreenshotBlob(null); }}
        onDelete={handleScreenshotDelete}
      />
    )}
  </>);
}
