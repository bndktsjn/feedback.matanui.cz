import { useState, useCallback, useEffect } from 'preact/hooks';
import type { Thread, Comment } from '../types';
import { api } from '../api';
import AuthorMeta from './AuthorMeta';
import MoreMenu from './MoreMenu';
import type { MenuItem } from './MoreMenu';
import Composer from './Composer';
import PagePreview from './PagePreview';
import ScreenshotLightbox from './ScreenshotLightbox';
import { IconBack, IconCheck, IconLink, IconTrash, IconInfo, IconPencil } from './Icons';
import { copyToClipboard } from '../utils';

function renderWithMentions(text: string): any {
  const mentionRegex = /@\[([^\]]+)\]\([^)]+\)/g;
  const parts: any[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <span key={key++} class="inline-flex items-center rounded bg-blue-100 px-1 py-0.5 text-xs font-medium text-blue-700">
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

interface ThreadDetailProps {
  thread: Thread;
  root: ShadowRoot;
  onBack: () => void;
  onResolve: (thread: Thread) => void;
  onDelete: (thread: Thread) => void;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

export default function ThreadDetail({
  thread: initialThread,
  root,
  onBack,
  onResolve,
  onDelete,
  onRefresh,
  showToast,
}: ThreadDetailProps) {
  const [thread, setThread] = useState<Thread>(initialThread);
  const [replySending, setReplySending] = useState(false);
  const [editingReply, setEditingReply] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showLightbox, setShowLightbox] = useState(false);

  const loadThread = useCallback(async () => {
    try {
      const full = await api.getThread(initialThread.id);
      setThread(full);
    } catch { /* keep stale */ }
  }, [initialThread.id]);

  useEffect(() => { loadThread(); }, [loadThread]);

  // Sync when initialThread changes (e.g. different thread selected)
  useEffect(() => {
    setThread(initialThread);
  }, [initialThread.id]);

  async function postReply(content: string) {
    if (!content.trim() || replySending) return;
    setReplySending(true);
    const tempId = `optimistic-${Date.now()}`;
    const optimisticComment: Comment = {
      id: tempId,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: null,
    };
    setThread((prev) => ({
      ...prev,
      comments: [...(prev.comments || []), optimisticComment],
      _count: { comments: (prev._count?.comments || 0) + 1 },
    }));
    try {
      await api.createComment(thread.id, { content });
      loadThread();
      onRefresh();
    } catch {
      showToast('Failed to post reply');
      setThread((prev) => ({
        ...prev,
        comments: prev.comments?.filter((c) => c.id !== tempId) || [],
        _count: { comments: Math.max(0, (prev._count?.comments || 0) - 1) },
      }));
    } finally {
      setReplySending(false);
    }
  }

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
    <>
      <div class="flex h-full flex-col">
        {/* Back + actions */}
        <div class="shrink-0 border-b border-gray-100 px-3 py-2">
          <button
            onClick={onBack}
            class="mb-2 flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            <IconBack /> Back
          </button>
          <div class="flex items-center gap-1">
            <span class="mr-auto font-mono text-[10px] text-gray-400">#{thread.id.slice(0, 8)}</span>
            <MoreMenu items={menuItems} root={root} />
          </div>
        </div>

        {/* Scrollable body */}
        <div class="flex-1 overflow-y-auto px-3 py-3">
          {/* Original message */}
          <div class="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
            <AuthorMeta
              displayName={thread.author?.displayName}
              avatarUrl={thread.author?.avatarUrl}
              createdAt={thread.createdAt}
            />
            <p class="mt-2 whitespace-pre-wrap text-sm text-gray-800">{renderWithMentions(thread.message)}</p>
            <PagePreview
              screenshotUrl={thread.screenshotUrl}
              onScreenshotClick={() => setShowLightbox(true)}
            />
          </div>

          {/* Replies */}
          <h4 class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Replies ({thread.comments?.length || 0})
          </h4>

          {(!thread.comments || thread.comments.length === 0) ? (
            <p class="text-xs text-gray-400">No replies yet.</p>
          ) : (
            <div class="space-y-3">
              {thread.comments.map((c: Comment) => (
                <div key={c.id} class="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
                  <AuthorMeta
                    displayName={c.author?.displayName}
                    avatarUrl={c.author?.avatarUrl}
                    guestEmail={c.guestEmail}
                    createdAt={c.createdAt}
                  />
                  {editingReply === c.id ? (
                    <div class="mt-1.5">
                      <textarea
                        value={editContent}
                        onInput={(e: Event) => setEditContent((e.target as HTMLTextAreaElement).value)}
                        rows={2}
                        class="w-full resize-none rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                      />
                      <div class="mt-1 flex gap-2">
                        <button onClick={() => setEditingReply(null)} class="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                        <button onClick={() => { setEditingReply(null); }} class="text-xs font-medium text-blue-600 hover:text-blue-800">Save</button>
                      </div>
                    </div>
                  ) : (
                    <p class="mt-1.5 whitespace-pre-wrap text-sm text-gray-700">{renderWithMentions(c.content)}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reply form */}
        <div class="shrink-0 border-t border-gray-100 px-3 py-2">
          <Composer
            placeholder="Reply…"
            onSubmit={postReply}
            sending={replySending}
          />
        </div>
      </div>

      {showLightbox && thread.screenshotUrl && (
        <ScreenshotLightbox
          screenshotUrl={thread.screenshotUrl}
          onClose={() => setShowLightbox(false)}
          root={root}
        />
      )}
    </>
  );
}
