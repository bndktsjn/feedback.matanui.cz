import { useRef, useState, useEffect } from 'preact/hooks';
import { IconSend } from './Icons';

interface ComposerProps {
  placeholder?: string;
  onSubmit: (content: string) => void;
  disabled?: boolean;
  sending?: boolean;
  autoFocus?: boolean;
  onContentChange?: (hasContent: boolean) => void;
}

export default function Composer({
  placeholder = 'Write a message…',
  onSubmit,
  disabled = false,
  sending = false,
  autoFocus = false,
  onContentChange,
}: ComposerProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    if (autoFocus && editorRef.current) editorRef.current.focus();
  }, [autoFocus]);

  useEffect(() => {
    onContentChange?.(hasContent);
  }, [hasContent, onContentChange]);

  function getPlainText(): string {
    return editorRef.current?.innerText?.trim() || '';
  }

  function updateHasContent() {
    setHasContent(getPlainText().length > 0);
  }

  function handleSubmit() {
    if (!editorRef.current || disabled || sending) return;
    const content = getPlainText();
    if (!content) return;
    onSubmit(content);
    editorRef.current.innerHTML = '';
    setHasContent(false);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      return;
    }
  }

  function handlePaste(e: ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  }

  return (
    <div class="relative rounded-lg border border-gray-200 transition">
      <div class="relative">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={updateHasContent}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          data-placeholder={placeholder}
          class="composer-editor w-full min-h-[36px] max-h-[120px] overflow-y-auto rounded-lg bg-transparent px-2.5 py-1.5 pr-9 text-sm text-gray-900 focus:outline-none disabled:opacity-50"
          role="textbox"
          aria-multiline="true"
        />
        <button
          onClick={handleSubmit}
          disabled={!hasContent || disabled || sending}
          class="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-30"
          title="Send (⌘+Enter)"
        >
          {sending ? (
            <div class="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
          ) : (
            <IconSend />
          )}
        </button>
      </div>
    </div>
  );
}
