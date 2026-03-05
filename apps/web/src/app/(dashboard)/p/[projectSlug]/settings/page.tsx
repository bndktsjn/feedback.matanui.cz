'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { orgs, projects } from '@/lib/api';

interface ProjectDetail {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  baseUrl: string;
  description?: string;
  settings: { apiKey?: string };
}

export default function ProjectSettingsPage() {
  const params = useParams();
  const projectSlug = params.projectSlug as string;
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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

  if (loading) return <div className="text-gray-500">Loading settings...</div>;
  if (!project) return <div className="text-gray-500">Project not found.</div>;

  const embedCode = getEmbedCode();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Project Settings</h1>

      <div className="mt-6 space-y-6">
        {/* Project Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">General</h2>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Name</dt>
              <dd className="text-sm text-gray-900">{project.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Slug</dt>
              <dd className="text-sm text-gray-900">{project.slug}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Base URL</dt>
              <dd className="text-sm text-gray-900">{project.baseUrl}</dd>
            </div>
            {project.description && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Description</dt>
                <dd className="text-sm text-gray-900">{project.description}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* API Key */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">API Key</h2>
          <p className="mt-1 text-sm text-gray-500">
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

        {/* Embed Code */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">Embed Code</h2>
          <p className="mt-1 text-sm text-gray-500">
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
      </div>
    </div>
  );
}
