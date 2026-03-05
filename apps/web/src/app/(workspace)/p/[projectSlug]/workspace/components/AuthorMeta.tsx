'use client';

import { timeAgo } from '../lib/utils';

interface AuthorMetaProps {
  displayName: string;
  avatarUrl?: string | null;
  createdAt: string;
  size?: 'sm' | 'md';
}

export default function AuthorMeta({ displayName, avatarUrl, createdAt, size = 'sm' }: AuthorMetaProps) {
  const avatarSize = size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-xs';
  return (
    <div className="flex items-center gap-1.5">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className={`${avatarSize} shrink-0 rounded-full object-cover`}
        />
      ) : (
        <div className={`${avatarSize} flex shrink-0 items-center justify-center rounded-full bg-gray-200 font-bold text-gray-600`}>
          {(displayName || '?')[0].toUpperCase()}
        </div>
      )}
      <span className="text-xs font-semibold text-gray-800">{displayName || 'Unknown'}</span>
      <span className="text-[10px] text-gray-400">· {timeAgo(createdAt)}</span>
    </div>
  );
}
