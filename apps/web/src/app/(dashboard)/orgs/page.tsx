'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { orgs, OrgWithRole } from '@/lib/api';

export default function OrgsPage() {
  const [orgList, setOrgList] = useState<OrgWithRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orgs
      .list()
      .then(setOrgList)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-gray-500">Loading organizations...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
        <Link
          href="/orgs/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Organization
        </Link>
      </div>

      {orgList.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-gray-500">No organizations yet.</p>
          <Link
            href="/orgs/new"
            className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            Create your first organization
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orgList.map((org) => (
            <Link
              key={org.id}
              href={`/o/${org.slug}/projects`}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <h2 className="text-lg font-semibold text-gray-900">{org.name}</h2>
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {org.role}
                </span>
                <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                  {org.plan}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
