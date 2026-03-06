'use client';

import { useEffect, useState } from 'react';
import { auth } from '@/lib/api';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try to authenticate but don't redirect — workspace may be public
    auth
      .me()
      .then(() => setLoading(false))
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}
