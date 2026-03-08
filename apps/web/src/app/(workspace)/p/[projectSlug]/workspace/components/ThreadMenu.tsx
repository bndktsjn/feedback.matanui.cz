'use client';

import { Thread } from '@/lib/api';
import MoreMenu, { MenuItem } from './MoreMenu';
import { IconLink, IconCheck, IconTrash, IconInfo } from './Icons';
import { copyToClipboard } from '../lib/utils';

interface ThreadMenuProps {
  thread: Thread;
  onResolve?: (thread: Thread) => void;
  onDelete: (thread: Thread) => void;
  onShowEnv?: (env: Record<string, unknown>, rect: DOMRect) => void;
  showToast: (msg: string) => void;
  /** Optional ref element for environment popover positioning */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export default function ThreadMenu({
  thread,
  onResolve,
  onDelete,
  onShowEnv,
  showToast,
  anchorRef,
}: ThreadMenuProps) {
  const menuItems: MenuItem[] = [
    {
      label: 'Copy link',
      icon: <IconLink />,
      action: () => {
        copyToClipboard(
          `${window.location.origin}${window.location.pathname}?thread=${thread.id}&viewport=${thread.viewport || 'desktop'}`
        )
          .then(() => showToast('Link copied'))
          .catch(() => showToast('Copy failed'));
      },
    },
  ];

  if (thread.environment && onShowEnv) {
    menuItems.push({
      label: 'Environment',
      icon: <IconInfo />,
      action: () => {
        const rect = anchorRef?.current?.getBoundingClientRect();
        if (rect) onShowEnv(thread.environment as Record<string, unknown>, rect);
      },
    });
  }

  menuItems.push({
    label: 'Delete thread',
    icon: <IconTrash />,
    danger: true,
    action: () => onDelete(thread),
  });

  return <MoreMenu items={menuItems} />;
}
