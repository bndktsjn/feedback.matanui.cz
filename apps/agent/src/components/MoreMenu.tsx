import { useState, useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { IconMoreDots } from './Icons';

export interface MenuItem {
  label: string;
  icon?: ComponentChildren;
  danger?: boolean;
  action: () => void;
}

interface MoreMenuProps {
  items: MenuItem[];
  root: ShadowRoot;
}

export default function MoreMenu({ items, root }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.right - 168 });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8 && btnRef.current) {
      const btnR = btnRef.current.getBoundingClientRect();
      setPos((p) => ({ ...p, top: btnR.top - r.height - 4 }));
    }
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        class="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
        title="More actions"
        type="button"
      >
        <IconMoreDots />
      </button>

      {open && (
        <div
          ref={menuRef}
          class="fixed z-[99997] w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
          style={{ top: pos.top, left: Math.max(8, pos.left) }}
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => { setOpen(false); item.action(); }}
              class={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition ${
                item.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
              type="button"
            >
              {item.icon && <span class="shrink-0">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
