'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { orgs, projects, ApiError } from '@/lib/api';

interface ProjectDetail {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  baseUrl: string;
  description?: string;
  settings: { apiKey?: string; publicWorkspace?: boolean; allowAnonymousComments?: boolean };
}

type ToastType = { message: string; type: 'success' | 'error' };

export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectSlug = params.projectSlug as string;
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<ToastType | null>(null);

  // Edit form
  const [editName, setEditName] = useState('');
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Workspace settings
  const [publicWorkspace, setPublicWorkspace] = useState(false);
  const [allowAnonymousComments, setAllowAnonymousComments] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const orgList = await orgs.list();
        for (const org of orgList) {
          const projList = (await projects.list(org.id)) as {
            id: string;
            slug: string;
          }[];
          const found = projList.find((p) => p.slug === projectSlug);
          if (found) {
            const detail = (await projects.get(org.id, found.id)) as ProjectDetail;
            setProject(detail);
            setOrgId(org.id);
            setOrgSlug(org.slug);
            setEditName(detail.name);
            setEditBaseUrl(detail.baseUrl);
            setEditDescription(detail.description || '');
            setPublicWorkspace(!!detail.settings?.publicWorkspace);
            setAllowAnonymousComments(!!detail.settings?.allowAnonymousComments);
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
  }, [projectSlug]);

  function showToastMsg(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  function getErrorMessage(err: unknown): string {
    if (err instanceof ApiError) return err.message;
    if (err instanceof Error) return err.message;
    return 'An unexpected error occurred';
  }

  function getEmbedCode(): string {
    if (!project?.settings?.apiKey) return '';
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://feedback.matanui.cz';
    return `<script src="${origin}/static/overlay.js" data-key="${project.settings.apiKey}"></script>`;
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!project || !orgId) return;
    setSaving(true);
    try {
      const updated = (await projects.update(orgId, project.id, {
        name: editName.trim(),
        baseUrl: editBaseUrl.trim(),
        description: editDescription.trim() || undefined,
      })) as ProjectDetail;
      setProject(updated);
      showToastMsg('Project updated', 'success');
    } catch (err) {
      showToastMsg(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!project || !orgId || !orgSlug) return;
    setDeleting(true);
    try {
      await projects.delete(orgId, project.id);
      router.push(`/o/${orgSlug}/projects`);
    } catch (err) {
      showToastMsg(getErrorMessage(err), 'error');
      setDeleting(false);
    }
  }

  if (loading) return <div className="text-gray-500">Loading settings...</div>;
  if (!project) return <div className="text-gray-500">Project not found.</div>;

  const embedCode = getEmbedCode();
  const hasChanges =
    editName.trim() !== project.name ||
    editBaseUrl.trim() !== project.baseUrl ||
    (editDescription.trim() || '') !== (project.description || '');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Project Settings</h1>

      {/* Toast */}
      {toast && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            toast.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* ── General Settings ── */}
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">General</h2>
        </div>
        <form onSubmit={handleSave} className="space-y-4 p-6">
          <div>
            <label htmlFor="projName" className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              id="projName"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Slug</label>
            <p className="mt-1 text-sm text-gray-500">{project.slug}</p>
          </div>
          <div>
            <label htmlFor="projBaseUrl" className="block text-sm font-medium text-gray-700">
              Base URL
            </label>
            <input
              id="projBaseUrl"
              type="url"
              value={editBaseUrl}
              onChange={(e) => setEditBaseUrl(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="projDesc" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="projDesc"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Optional project description"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !hasChanges}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>

      {/* ── API Key ── */}
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">API Key</h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-500">
            Use this key to authenticate overlay requests from your website.
          </p>
          {project.settings?.apiKey ? (
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 rounded bg-gray-100 px-3 py-2 text-sm font-mono text-gray-800">
                {project.settings.apiKey}
              </code>
              <button
                onClick={() => copyToClipboard(project.settings.apiKey!)}
                className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Copy
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-400">No API key generated.</p>
          )}
        </div>
      </section>

      {/* ── Embed Code ── */}
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Embed Code</h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-500">
            Add this script tag to your website&apos;s HTML to enable the feedback overlay.
          </p>
          {embedCode ? (
            <div className="mt-3">
              <pre className="rounded bg-gray-900 p-4 text-sm text-green-400 overflow-x-auto">
                {embedCode}
              </pre>
              <button
                onClick={() => copyToClipboard(embedCode)}
                className="mt-2 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                {copied ? 'Copied!' : 'Copy embed code'}
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-400">No API key available for embed code.</p>
          )}
        </div>
      </section>

      {/* ── Workspace Access ── */}
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Workspace Access</h2>
          <p className="mt-1 text-sm text-gray-500">
            Control who can view and interact with the feedback workspace.
          </p>
        </div>
        <div className="space-y-4 p-6">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={publicWorkspace}
              onChange={async (e) => {
                const val = e.target.checked;
                setPublicWorkspace(val);
                if (!val) setAllowAnonymousComments(false);
                setSavingWorkspace(true);
                try {
                  const updated = (await projects.update(orgId!, project.id, {
                    publicWorkspace: val,
                    ...(!val ? { allowAnonymousComments: false } : {}),
                  })) as ProjectDetail;
                  setProject(updated);
                  showToastMsg(val ? 'Public workspace enabled' : 'Public workspace disabled', 'success');
                } catch (err) {
                  setPublicWorkspace(!val);
                  showToastMsg(getErrorMessage(err), 'error');
                } finally {
                  setSavingWorkspace(false);
                }
              }}
              disabled={savingWorkspace}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Public workspace</span>
              <p className="text-sm text-gray-500">
                Allow anyone to view the workspace and browse threads/comments without logging in.
              </p>
            </div>
          </label>

          <label className={`flex items-start gap-3 ${!publicWorkspace ? 'opacity-50' : ''}`}>
            <input
              type="checkbox"
              checked={allowAnonymousComments}
              onChange={async (e) => {
                const val = e.target.checked;
                setAllowAnonymousComments(val);
                setSavingWorkspace(true);
                try {
                  const updated = (await projects.update(orgId!, project.id, {
                    allowAnonymousComments: val,
                  })) as ProjectDetail;
                  setProject(updated);
                  showToastMsg(val ? 'Anonymous commenting enabled' : 'Anonymous commenting disabled', 'success');
                } catch (err) {
                  setAllowAnonymousComments(!val);
                  showToastMsg(getErrorMessage(err), 'error');
                } finally {
                  setSavingWorkspace(false);
                }
              }}
              disabled={savingWorkspace || !publicWorkspace}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Allow anonymous comments</span>
              <p className="text-sm text-gray-500">
                Let visitors create threads and comments without an account. They must provide an email address.
                If they later register with that email, their content will be linked to their account.
              </p>
            </div>
          </label>
        </div>
      </section>

      {/* ── Members ── */}
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Members</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage who has access to this project and their roles.
          </p>
        </div>
        <div className="p-6">
          <a
            href={`/p/${projectSlug}/settings/members`}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Manage project members
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>
        </div>
      </section>

      {/* ── Danger Zone ── */}
      <section className="rounded-lg border border-red-200 bg-white">
        <div className="border-b border-red-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-red-700">Danger Zone</h2>
        </div>
        <div className="p-6">
          {!showDeleteConfirm ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Delete this project</p>
                <p className="text-sm text-gray-500">
                  Permanently delete this project and all its threads, comments, and data.
                </p>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="ml-4 shrink-0 rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete project
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-sm font-medium text-red-800">
                  This will permanently delete the project &ldquo;{project.name}&rdquo; and all
                  associated data. This action cannot be undone.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Type <strong>{project.name}</strong> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  placeholder={project.name}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={deleting || deleteConfirmText !== project.name}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Yes, delete this project'}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
