'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { orgs, projects, OrgWithRole } from '@/lib/api';
import AccessSetupModal from './components/AccessSetupModal';

interface Project {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  description?: string;
  createdAt: string;
}

export default function ProjectsPage() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const [org, setOrg] = useState<OrgWithRole | null>(null);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalProject, setModalProject] = useState<Project | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const orgList = await orgs.list();
        const found = orgList.find((o) => o.slug === orgSlug);
        if (!found) return;
        setOrg(found);
        const list = (await projects.list(found.id)) as Project[];
        setProjectList(list);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orgSlug]);

  if (loading) return <div className="text-gray-500">Loading projects...</div>;
  if (!org) return <div className="text-gray-500">Organization not found.</div>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{org.name}</p>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        </div>
        <Link
          href={`/o/${orgSlug}/projects/new`}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Project
        </Link>
      </div>

      {projectList.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-gray-500">No projects yet.</p>
          <Link
            href={`/o/${orgSlug}/projects/new`}
            className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            Create your first project
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projectList.map((project) => (
            <div
              key={project.id}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <Link href={`/p/${project.slug}/threads`}>
                <h2 className="text-lg font-semibold text-gray-900">{project.name}</h2>
                {project.description && (
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">{project.description}</p>
                )}
                <p className="mt-2 truncate text-xs text-gray-400">{project.baseUrl}</p>
              </Link>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setModalProject(project)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Feedback
                </button>
                <Link
                  href={`/p/${project.slug}/settings`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  Settings
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Access setup modal */}
      {modalProject && org && (
        <AccessSetupModal
          projectName={modalProject.name}
          projectBaseUrl={modalProject.baseUrl}
          projectSlug={modalProject.slug}
          projectId={modalProject.id}
          orgId={org.id}
          onClose={() => setModalProject(null)}
        />
      )}
    </div>
  );
}
