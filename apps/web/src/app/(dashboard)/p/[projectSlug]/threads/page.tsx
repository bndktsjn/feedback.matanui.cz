'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { threads, orgs, projects, Thread } from '@/lib/api';

interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
  orgId: string;
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-600',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export default function ThreadsPage() {
  const params = useParams();
  const projectSlug = params.projectSlug as string;

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [threadList, setThreadList] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  const loadThreads = useCallback(
    async (proj: ProjectInfo) => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      const list = await threads.list(proj.id, params);
      setThreadList(list);
    },
    [statusFilter, priorityFilter],
  );

  useEffect(() => {
    async function load() {
      try {
        const orgList = await orgs.list();
        for (const org of orgList) {
          const projList = (await projects.list(org.id)) as ProjectInfo[];
          const found = projList.find((p) => p.slug === projectSlug);
          if (found) {
            setProject(found);
            await loadThreads(found);
            break;
          }
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectSlug, loadThreads]);

  useEffect(() => {
    if (project) loadThreads(project);
  }, [project, loadThreads]);

  if (loading) return <div className="text-gray-500">Loading threads...</div>;
  if (!project) return <div className="text-gray-500">Project not found.</div>;

  return (
    <div className="flex h-full gap-6">
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{project.name} — Threads</h1>
        </div>

        <div className="mt-4 flex gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        {threadList.length === 0 ? (
          <p className="mt-8 text-center text-gray-500">No threads found.</p>
        ) : (
          <div className="mt-4 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
            {threadList.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setSelectedThread(thread)}
                className={`flex w-full items-start gap-3 p-4 text-left transition hover:bg-gray-50 ${
                  selectedThread?.id === thread.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">{thread.title}</p>
                  <p className="mt-0.5 truncate text-sm text-gray-500">{thread.pageUrl}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[thread.status] || ''}`}
                    >
                      {thread.status}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[thread.priority] || ''}`}
                    >
                      {thread.priority}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {thread.type}
                    </span>
                    {thread._count.comments > 0 && (
                      <span className="text-xs text-gray-400">
                        {thread._count.comments} comments
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  {new Date(thread.createdAt).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedThread && (
        <div className="w-96 overflow-y-auto rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{selectedThread.title}</h2>
            <button
              onClick={() => setSelectedThread(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[selectedThread.status] || ''}`}
            >
              {selectedThread.status}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[selectedThread.priority] || ''}`}
            >
              {selectedThread.priority}
            </span>
          </div>
          <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">{selectedThread.message}</p>
          <div className="mt-4 border-t border-gray-200 pt-3">
            <p className="text-xs text-gray-500">
              By {selectedThread.author?.displayName || 'Unknown'} on{' '}
              {new Date(selectedThread.createdAt).toLocaleString()}
            </p>
            <p className="mt-1 truncate text-xs text-gray-400">{selectedThread.pageUrl}</p>
          </div>
        </div>
      )}
    </div>
  );
}
