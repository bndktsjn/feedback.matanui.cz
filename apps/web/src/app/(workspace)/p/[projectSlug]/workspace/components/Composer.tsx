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
  /** Keyboard shortcut hint shown below */
  shortcutHint?: boolean;
  /** External ref for imperative control */
  composerRef?: React.Ref<ComposerHandle>;
  /** Callback when content changes (for parent shake-guard etc.) */
  onContentChange?: (hasContent: boolean) => void;
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
  shortcutHint = false,
  composerRef,
  onContentChange,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState('');
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<ProjectMemberUser[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [mentionPos, setMentionPos] = useState<{ top: number; left: number } | null>(null);
  const mentionTimer = useRef<ReturnType<typeof setTimeout>>();

  const hasContent = content.trim().length > 0 || stagedFiles.length > 0;
  const showActions = alwaysShowActions || hasContent || focused;

  // Notify parent of content changes
  useEffect(() => {
    onContentChange?.(hasContent);
  }, [hasContent, onContentChange]);

  // Auto-focus
  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  // Expose imperative handle
  useEffect(() => {
    if (!composerRef) return;
    const handle: ComposerHandle = {
      focus: () => textareaRef.current?.focus(),
      reset: () => { setContent(''); setStagedFiles([]); setMentionIds([]); },
      getValue: () => content,
      getStagedFiles: () => stagedFiles,
      getMentionIds: () => mentionIds,
    };
    if (typeof composerRef === 'function') composerRef(handle);
    else if (composerRef && 'current' in composerRef) (composerRef as React.MutableRefObject<ComposerHandle | null>).current = handle;
  }, [composerRef, content, stagedFiles, mentionIds]);

  /* ── Auto-resize textarea ─────────────────────────────────── */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [content]);

  /* ── Mention detection ────────────────────────────────────── */
  const detectMention = useCallback((text: string, cursorPos: number) => {
    const before = text.slice(0, cursorPos);
    const atIdx = before.lastIndexOf('@');
    if (atIdx === -1 || (atIdx > 0 && /\S/.test(before[atIdx - 1]))) {
      setMentionQuery(null);
      return;
    }
    const query = before.slice(atIdx + 1);
    if (query.length > 20 || /\n/.test(query)) {
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
    clearTimeout(mentionTimer.current);
    mentionTimer.current = setTimeout(async () => {
      setMentionLoading(true);
      try {
        const results = await usersApi.search(projectId, mentionQuery || undefined);
        setMentionResults(results);
        setMentionIdx(0);
        // Position popup below textarea
        const ta = textareaRef.current;
        if (ta) {
          const rect = ta.getBoundingClientRect();
          setMentionPos({ top: rect.bottom + 4, left: rect.left });
        }
      } catch {
        setMentionResults([]);
      } finally {
        setMentionLoading(false);
      }
    }, 200);
    return () => clearTimeout(mentionTimer.current);
  }, [mentionQuery, projectId]);

  function insertMention(user: ProjectMemberUser) {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursorPos = ta.selectionStart;
    const before = content.slice(0, cursorPos);
    const atIdx = before.lastIndexOf('@');
    if (atIdx === -1) return;
    const mentionText = `@[${user.displayName}](${user.id})`;
    const newContent = content.slice(0, atIdx) + mentionText + ' ' + content.slice(cursorPos);
    setContent(newContent);
    setMentionQuery(null);
    setMentionIds((prev) => prev.includes(user.id) ? prev : [...prev, user.id]);
    // Set cursor after mention
    requestAnimationFrame(() => {
      const newPos = atIdx + mentionText.length + 1;
      ta.setSelectionRange(newPos, newPos);
      ta.focus();
    });
  }

  function closeMention() {
    setMentionQuery(null);
    setMentionResults([]);
    setMentionPos(null);
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
    if (!content.trim() || disabled || sending) return;
    onSubmit(content.trim(), stagedFiles, mentionIds);
  }

  /* ── Key handling ─────────────────────────────────────────── */
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setContent(val);
    detectMention(val, e.target.selectionStart);
  }

  /* ── Drag & drop ──────────────────────────────────────────── */
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }

  /* ── Render ───────────────────────────────────────────────── */

  // Format content for display: replace @[Name](id) with styled @Name
  const displayContent = content.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');

  return (
    <div
      className={`relative rounded-lg border transition ${dragOver ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200'}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Input area with inline send button */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={displayContent}
          onChange={handleInput}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          className="w-full resize-none rounded-lg bg-transparent px-2.5 py-1.5 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50"
          style={{ minHeight: 36 }}
        />
        <button
          onClick={handleSubmit}
          disabled={!content.trim() || disabled || sending}
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

      {/* Staged file chips */}
      {stagedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2.5 pb-1">
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

      {/* Action row: @ + paperclip — visible when focused or has content */}
      {showActions && (
        <div className="flex items-center gap-0.5 border-t border-gray-100 px-1.5 py-0.5">
          <button
            type="button"
            onClick={() => {
              const ta = textareaRef.current;
              if (!ta) return;
              ta.focus();
              const pos = ta.selectionStart;
              const before = content.slice(0, pos);
              const prefix = before.length && !/\s$/.test(before) ? ' @' : '@';
              const newVal = content.slice(0, pos) + prefix + content.slice(pos);
              setContent(newVal);
              requestAnimationFrame(() => {
                const newPos = pos + prefix.length;
                ta.setSelectionRange(newPos, newPos);
                detectMention(newVal, newPos);
              });
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
          {shortcutHint && (
            <span className="ml-auto text-[10px] text-gray-300">⌘+Enter to send</span>
          )}
        </div>
      )}

      {/* Mention autocomplete popup */}
      {mentionPos && mentionQuery !== null && (
        typeof document !== 'undefined' ? createPortal(
          <div
            className="fixed z-[99999] w-56 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl"
            style={{ top: mentionPos.top, left: mentionPos.left }}
          >
            {mentionLoading && (
              <div className="px-3 py-2 text-xs text-gray-400">Loading…</div>
            )}
            {!mentionLoading && mentionResults.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">No users found</div>
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
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-[10px] font-medium text-gray-500">
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
