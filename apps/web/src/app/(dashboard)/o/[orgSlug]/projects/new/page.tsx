'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { orgs, projects, ApiError, OrgWithRole } from '@/lib/api';

export default function NewProjectPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;
  const [org, setOrg] = useState<OrgWithRole | null>(null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [addMembers, setAddMembers] = useState(false);

  useEffect(() => {
    orgs.list().then((list) => {
      const found = list.find((o) => o.slug === orgSlug);
      if (found) setOrg(found);
    });
  }, [orgSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    setError('');
    setLoading(true);
    try {
      const project = (await projects.create(org.id, {
        name,
        baseUrl,
        description: description || undefined,
      })) as { slug: string };
      if (addMembers) {
        router.push(`/p/${project.slug}/settings/members`);
      } else {
        router.push(`/p/${project.slug}/threads`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900">New Project</h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Project name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="My Website"
          />
        </div>

        <div>
          <label htmlFor="baseUrl" className="block text-sm font-medium text-gray-700">
            Base URL
          </label>
          <input
            id="baseUrl"
            type="url"
            required
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="https://example.com"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description (optional)
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Member assignment hint */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={addMembers}
              onChange={(e) => setAddMembers(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Add team members after creation</span>
              <p className="text-xs text-gray-500 mt-0.5">
                Organization owners and admins automatically have access. Check this to assign
                specific members right after creating the project.
              </p>
            </div>
          </label>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : addMembers ? 'Create & Add Members' : 'Create'}
          </button>
          <Link
            href={`/o/${orgSlug}/projects`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
