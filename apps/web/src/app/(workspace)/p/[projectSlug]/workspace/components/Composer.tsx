'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { users as usersApi, ProjectMemberUser, AttachmentInfo } from '@/lib/api';
import { truncate } from '../lib/utils';
import { IconSend, IconAt, IconPaperclip, IconX } from './Icons';

/* ── Types ──────────────────────────────────────────────────── */

export interface StagedFile {
  file: File;
  progress: number;
  done: boolean;
  error?: string;
  result?: AttachmentInfo;
}

export interface ComposerHandle {
  focus: () => void;
  reset: () => void;
  getValue: () => string;
  getStagedFiles: () => StagedFile[];
  getMentionIds: () => string[];
}

interface ComposerProps {
  placeholder?: string;
  projectId: string;
  /** Called on submit — content, staged file objects, mentioned user IDs */
  onSubmit: (content: string, files: StagedFile[], mentionIds: string[]) => void;
  disabled?: boolean;
  sending?: boolean;
  /** If true, show the action row always (not just on content) */
  alwaysShowActions?: boolean;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** External ref for imperative control */
  composerRef?: React.Ref<ComposerHandle>;
  /** Callback when content changes (for parent shake-guard etc.) */
  onContentChange?: (hasContent: boolean) => void;
}

/* ── Helpers ─────────────────────────────────────────────────── */

/** Serialize contenteditable HTML → plain text with @[Name](id) mentions */
function serializeEditor(el: HTMLElement): string {
  let result = '';
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      if (elem.dataset.mentionId) {
        const name = elem.textContent?.replace(/^@/, '') || '';
        result += `@[${name}](${elem.dataset.mentionId})`;
      } else if (elem.tagName === 'BR') {
        result += '\n';
      } else {
        result += serializeEditor(elem);
      }
    }
  });
  return result;
}

/** Get plain text content from contenteditable (for length checks) */
function getPlainText(el: HTMLElement): string {
  return el.innerText || '';
}

/** Get text before the cursor in a contenteditable element */
function getTextBeforeCursor(): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '';
  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(range.startContainer.parentElement?.closest('[contenteditable]') || range.startContainer);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString();
}

/** Collect all mention IDs from the editor DOM */
function collectMentionIds(el: HTMLElement): string[] {
  const ids: string[] = [];
  el.querySelectorAll('[data-mention-id]').forEach((span) => {
    const id = (span as HTMLElement).dataset.mentionId;
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

/* ── Composer ───────────────────────────────────────────────── */

export default function Composer({
  placeholder = 'Write a message…',
  projectId,
  onSubmit,
  disabled = false,
  sending = false,
  alwaysShowActions = false,
  autoFocus = false,
  composerRef,
  onContentChange,
}: ComposerProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [hasContent, setHasContent] = useState(false);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<ProjectMemberUser[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [mentionPos, setMentionPos] = useState<{ top: number; left: number } | null>(null);
  const mentionTimer = useRef<ReturnType<typeof setTimeout>>();

  const showActions = alwaysShowActions || hasContent;

  // Notify parent of content changes
  useEffect(() => {
    onContentChange?.(hasContent);
  }, [hasContent, onContentChange]);

  // Auto-focus
  useEffect(() => {
    if (autoFocus && editorRef.current) editorRef.current.focus();
  }, [autoFocus]);

  // Expose imperative handle
  useEffect(() => {
    if (!composerRef) return;
    const handle: ComposerHandle = {
      focus: () => editorRef.current?.focus(),
      reset: () => {
        if (editorRef.current) editorRef.current.innerHTML = '';
        setStagedFiles([]);
        setHasContent(false);
      },
      getValue: () => editorRef.current ? serializeEditor(editorRef.current) : '',
      getStagedFiles: () => stagedFiles,
      getMentionIds: () => editorRef.current ? collectMentionIds(editorRef.current) : [],
    };
    if (typeof composerRef === 'function') composerRef(handle);
    else if (composerRef && 'current' in composerRef) (composerRef as React.MutableRefObject<ComposerHandle | null>).current = handle;
  }, [composerRef, stagedFiles, hasContent]);

  /* ── Mention detection ────────────────────────────────────── */
  const detectMention = useCallback(() => {
    const textBefore = getTextBeforeCursor();
    const atIdx = textBefore.lastIndexOf('@');
    if (atIdx === -1 || (atIdx > 0 && /\S/.test(textBefore[atIdx - 1]))) {
      setMentionQuery(null);
      return;
    }
    const query = textBefore.slice(atIdx + 1);
    if (/\s/.test(query) || query.length > 20) {
      setMentionQuery(null);
      return;
    }
    setMentionQuery(query);
  }, []);

  // Fetch mention results with debounce
  useEffect(() => {
    if (mentionQuery === null) {
      setMentionResults([]);
      setMentionPos(null);
      return;
    }
    const el = editorRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setMentionPos({ top: rect.top - 4, left: rect.left });
    }
    setMentionLoading(true);
    clearTimeout(mentionTimer.current);
    mentionTimer.current = setTimeout(async () => {
      try {
        const results = await usersApi.search(projectId, mentionQuery || undefined);
        setMentionResults(results);
        setMentionIdx(0);
      } catch {
        setMentionResults([]);
        setMentionIdx(0);
      } finally {
        setMentionLoading(false);
      }
    }, 100);
    return () => clearTimeout(mentionTimer.current);
  }, [mentionQuery, projectId]);

  function insertMention(user: ProjectMemberUser) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return;

    const range = sel.getRangeAt(0);
    const textNode = range.startContainer;
    if (textNode.nodeType !== Node.TEXT_NODE) return;

    const text = textNode.textContent || '';
    const cursorOffset = range.startOffset;
    const atIdx = text.lastIndexOf('@', cursorOffset - 1);
    if (atIdx === -1) return;

    // Create mention span
    const mention = document.createElement('span');
    mention.dataset.mentionId = user.id;
    mention.contentEditable = 'false';
    mention.className = 'inline-flex items-center rounded bg-blue-100 px-1 py-0.5 text-xs font-medium text-blue-700 mx-0.5 select-none';
    mention.textContent = `@${user.displayName}`;

    // Split text node and insert mention
    const before = text.slice(0, atIdx);
    const after = text.slice(cursorOffset);
    const parent = textNode.parentNode!;

    const beforeNode = document.createTextNode(before);
    const afterNode = document.createTextNode(after.length ? after : '\u00A0');

    parent.insertBefore(beforeNode, textNode);
    parent.insertBefore(mention, textNode);
    parent.insertBefore(afterNode, textNode);
    parent.removeChild(textNode);

    // Place cursor after mention
    const newRange = document.createRange();
    newRange.setStart(afterNode, after.length ? 0 : 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    setMentionQuery(null);
    updateHasContent();
  }

  function closeMention() {
    setMentionQuery(null);
    setMentionResults([]);
    setMentionPos(null);
  }

  function updateHasContent() {
    if (!editorRef.current) return;
    const text = getPlainText(editorRef.current).trim();
    setHasContent(text.length > 0 || stagedFiles.length > 0);
  }

  /* ── File staging ─────────────────────────────────────────── */
  function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    const newStaged: StagedFile[] = files.map((f) => ({
      file: f,
      progress: 0,
      done: false,
    }));
    setStagedFiles((prev) => [...prev, ...newStaged]);
  }

  function removeFile(idx: number) {
    setStagedFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  /* ── Submit ───────────────────────────────────────────────── */
  function handleSubmit() {
    if (!editorRef.current || disabled || sending) return;
    const content = serializeEditor(editorRef.current).trim();
    if (!content) return;
    const ids = collectMentionIds(editorRef.current);
    onSubmit(content, stagedFiles, ids);
    // Reset editor
    editorRef.current.innerHTML = '';
    setStagedFiles([]);
    setHasContent(false);
  }

  /* ── Key handling ─────────────────────────────────────────── */
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Mention popup navigation
    if (mentionQuery !== null && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIdx((i) => (i + 1) % mentionResults.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIdx((i) => (i - 1 + mentionResults.length) % mentionResults.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionResults[mentionIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMention();
        return;
      }
    }
    // Submit on Ctrl/Cmd+Enter
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
      return;
    }
    // Prevent default Enter from creating divs — insert <br> instead
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      return;
    }
    // Atomic backspace for mentions
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        // If cursor is right after a mention span
        if (node.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
          const prev = node.previousSibling as HTMLElement | null;
          if (prev?.dataset?.mentionId) {
            e.preventDefault();
            prev.remove();
            updateHasContent();
            return;
          }
        }
        // If cursor is inside editor and previous sibling of cursor container is mention
        if (node === editorRef.current && range.startOffset > 0) {
          const child = editorRef.current.childNodes[range.startOffset - 1] as HTMLElement;
          if (child?.dataset?.mentionId) {
            e.preventDefault();
            child.remove();
            updateHasContent();
            return;
          }
        }
      }
    }
  }

  function handleInput() {
    detectMention();
    updateHasContent();
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }

  /* ── Drag & drop ──────────────────────────────────────────── */
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }

  /* ── Render ───────────────────────────────────────────────── */

  return (
    <div
      className={`relative rounded-lg border transition ${dragOver ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200'}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Contenteditable input area with inline send button */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => {}}
          onBlur={() => setTimeout(closeMention, 150)}
          data-placeholder={placeholder}
          className="composer-editor w-full min-h-[36px] max-h-[120px] overflow-y-auto rounded-lg bg-transparent px-2.5 py-1.5 pr-9 text-sm text-gray-900 focus:outline-none disabled:opacity-50 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 empty:before:pointer-events-none"
          role="textbox"
          aria-multiline="true"
        />
        <button
          onClick={handleSubmit}
          disabled={!hasContent || disabled || sending}
          className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-30"
          title="Send (⌘+Enter)"
        >
          {sending ? (
            <div className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
          ) : (
            <IconSend />
          )}
        </button>
      </div>

      {/* Action row: @ + paperclip — visible when user has typed content */}
      <div
        className={`flex items-center gap-0.5 border-t border-gray-100 px-1.5 overflow-hidden transition-all duration-150 ease-in-out ${
          showActions ? 'max-h-8 py-0.5 opacity-100' : 'max-h-0 py-0 opacity-0 border-t-transparent'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            const el = editorRef.current;
            if (!el) return;
            el.focus();
            // Insert @ at cursor
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              const textBefore = getTextBeforeCursor();
              const prefix = textBefore.length && !/\s$/.test(textBefore) ? ' @' : '@';
              document.execCommand('insertText', false, prefix);
              detectMention();
            }
          }}
          className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="Mention someone"
        >
          <IconAt />
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="Attach file"
        >
          <IconPaperclip />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Staged file chips — below actions, outside text area */}
      {stagedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-gray-100 px-2.5 py-1.5">
          {stagedFiles.map((sf, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600"
            >
              {sf.file.type.startsWith('image/') && (
                <span className="h-3 w-3 rounded overflow-hidden flex-shrink-0">
                  <img src={URL.createObjectURL(sf.file)} alt="" className="h-full w-full object-cover" />
                </span>
              )}
              {truncate(sf.file.name, 18)}
              {!sf.done && sf.progress > 0 && (
                <span className="text-[10px] text-gray-400">{sf.progress}%</span>
              )}
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-gray-400 hover:text-gray-600"
              >
                <IconX />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Mention autocomplete popup — positioned above the editor */}
      {mentionPos && mentionQuery !== null && (
        typeof document !== 'undefined' ? createPortal(
          <div
            className="fixed z-[99999] w-56 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl"
            style={{ top: mentionPos.top, left: mentionPos.left, transform: 'translateY(-100%)' }}
          >
            {mentionLoading && (
              <div className="px-3 py-2 text-xs text-gray-400">Searching…</div>
            )}
            {!mentionLoading && mentionResults.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">No members found</div>
            )}
            {!mentionLoading && mentionResults.map((u, i) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition ${
                  i === mentionIdx ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {u.avatarUrl ? (
                  <img src={u.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-medium text-blue-600">
                    {(u.displayName || u.email)[0]?.toUpperCase()}
                  </div>
                )}
                <span className="truncate">{u.displayName || u.email}</span>
              </button>
            ))}
          </div>,
          document.body
        ) : null
      )}
    </div>
  );
}
