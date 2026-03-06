'use client';

import { timeAgo } from '../lib/utils';

interface AuthorMetaProps {
  displayName?: string | null;
  avatarUrl?: string | null;
  guestEmail?: string | null;
  createdAt: string;
  size?: 'sm' | 'md';
}

export default function AuthorMeta({ displayName, avatarUrl, guestEmail, createdAt, size = 'sm' }: AuthorMetaProps) {
  const avatarSize = size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-xs';
  const name = displayName || (guestEmail ? guestEmail.split('@')[0] : 'Unknown');
  const isGuest = !displayName && !!guestEmail;
  return (
    <div className="flex items-center gap-1.5">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className={`${avatarSize} shrink-0 rounded-full object-cover`}
        />
      ) : (
        <div className={`${avatarSize} flex shrink-0 items-center justify-center rounded-full ${isGuest ? 'bg-purple-100 text-purple-600' : 'bg-gray-200 text-gray-600'} font-bold`}>
          {(name || '?')[0].toUpperCase()}
        </div>
      )}
      <span className="text-xs font-semibold text-gray-800">{name}</span>
      {isGuest && <span className="text-[10px] rounded bg-purple-50 px-1 text-purple-500">guest</span>}
      <span className="text-[10px] text-gray-400">· {timeAgo(createdAt)}</span>
    </div>
  );
}
