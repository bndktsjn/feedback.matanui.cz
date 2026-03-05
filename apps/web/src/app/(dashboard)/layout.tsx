'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { auth, orgs, projects, User, OrgWithRole } from '@/lib/api';

interface ProjectSettings {
  apiKey?: string;
}

interface ProjectContext {
  id: string;
  name: string;
  slug: string;
  orgId: string;
  orgSlug: string;
  orgName: string;
}

function NavLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-50 text-blue-700'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      <span className="flex h-4 w-4 items-center justify-center text-current opacity-60">{icon}</span>
      {children}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 first:mt-0">
      {children}
    </p>
  );
}

// SVG icons as components
const Icons = {
  grid: <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/></svg>,
  users: <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4"><path d="M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1h8zm-7.978-1A.261.261 0 0 1 7 12.996c.001-.264.167-1.03.76-1.72C8.312 10.629 9.282 10 11 10c1.717 0 2.687.63 3.24 1.276.593.69.758 1.457.76 1.72l-.008.002a.274.274 0 0 1-.014.002H7.022zM11 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm3-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM6.936 9.28a5.88 5.88 0 0 0-1.23-.247A7.35 7.35 0 0 0 5 9c-4 0-5 3-5 4 0 .667.333 1 1 1h4.216A2.238 2.238 0 0 1 5 13c0-.455.131-.965.37-1.468.37-.79.96-1.532 1.743-2.1.228-.167.47-.316.723-.448A.09.09 0 0 0 7.78 9a4.72 4.72 0 0 0-.844.28z"/></svg>,
  chat: <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4"><path d="M2.678 11.894a1 1 0 0 1 .287.801 10.97 10.97 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8.06 8.06 0 0 0 8 14c3.996 0 7-2.807 7-6 0-3.192-3.004-6-7-6S1 4.808 1 8c0 1.468.617 2.83 1.678 3.894z"/></svg>,
  kanban: <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4"><path d="M0 2a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1v7.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 1 12.5V5a1 1 0 0 1-1-1V2zm5.5 3a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 5.5 13h1A1.5 1.5 0 0 0 8 11.5v-5A1.5 1.5 0 0 0 6.5 5h-1zM5 6.5A.5.5 0 0 1 5.5 6h1a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-5zm4.5-.5a1.5 1.5 0 0 0-1.5 1.5v3.5A1.5 1.5 0 0 0 9.5 13h1a1.5 1.5 0 0 0 1.5-1.5V7.5A1.5 1.5 0 0 0 10.5 6h-1zM9 7.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v3.5a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5V7.5z"/></svg>,
  monitor: <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4"><path d="M6 12h4v1H6v-1zm-1 0v2h6v-2h2a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2zm-2-2V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>,
  gear: <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4"><path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/></svg>,
  chevron: <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3"><path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/></svg>,
  back: <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path fillRule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z"/></svg>,
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [orgList, setOrgList] = useState<OrgWithRole[]>([]);
  const [projectCtx, setProjectCtx] = useState<ProjectContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgSwitcherOpen, setOrgSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const [wsModalOpen, setWsModalOpen] = useState(false);
  const [wsEmbedCode, setWsEmbedCode] = useState('');
  const [wsCopied, setWsCopied] = useState(false);

  // Parse URL context
  const orgSlugMatch = pathname.match(/^\/o\/([^/]+)/);
  const orgSlug = orgSlugMatch ? orgSlugMatch[1] : null;
  const projectSlugMatch = pathname.match(/^\/p\/([^/]+)/);
  const projectSlug = projectSlugMatch ? projectSlugMatch[1] : null;

  // Current org from URL or project context
  const currentOrg = orgSlug
    ? orgList.find((o) => o.slug === orgSlug) || null
    : projectCtx
      ? orgList.find((o) => o.id === projectCtx.orgId) || null
      : null;

  // Load user + orgs
  useEffect(() => {
    async function init() {
      try {
        const [u, ol] = await Promise.all([auth.me(), orgs.list()]);
        setUser(u);
        setOrgList(ol);
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

  // Resolve project context when on /p/[slug]/* routes
  const resolveProject = useCallback(
    async (slug: string, orgsList: OrgWithRole[]) => {
      for (const org of orgsList) {
        try {
          const projList = (await projects.list(org.id)) as {
            id: string;
            name: string;
            slug: string;
            orgId: string;
          }[];
          const found = projList.find((p) => p.slug === slug);
          if (found) {
            setProjectCtx({
              id: found.id,
              name: found.name,
              slug: found.slug,
              orgId: org.id,
              orgSlug: org.slug,
              orgName: org.name,
            });
            return;
          }
        } catch {
          /* skip */
        }
      }
      setProjectCtx(null);
    },
    [],
  );

  useEffect(() => {
    if (projectSlug && orgList.length > 0) {
      // Only resolve if context is stale
      if (!projectCtx || projectCtx.slug !== projectSlug) {
        resolveProject(projectSlug, orgList);
      }
    } else if (!projectSlug) {
      setProjectCtx(null);
    }
  }, [projectSlug, orgList, projectCtx, resolveProject]);

  // Close org switcher on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setOrgSwitcherOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleLogout() {
    await auth.logout().catch(() => {});
    router.push('/login');
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  const isInProject = !!projectSlug && !!projectCtx;

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ── */}
      <aside className="flex w-60 flex-col border-r border-gray-200 bg-white">
        {/* Logo */}
        <div className="flex h-14 items-center border-b border-gray-100 px-4">
          <Link href="/orgs" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
              F
            </div>
            <span className="text-sm font-bold text-gray-900">Feedback</span>
          </Link>
        </div>

        {/* Org switcher */}
        {orgList.length > 0 && (currentOrg || orgSlug || isInProject) && (
          <div className="relative border-b border-gray-100 px-3 py-2" ref={switcherRef}>
            <button
              onClick={() => setOrgSwitcherOpen(!orgSwitcherOpen)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-gray-50"
            >
              <span className="truncate font-medium text-gray-900">
                {currentOrg?.name || 'Select organization'}
              </span>
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                className={`h-3 w-3 text-gray-400 transition-transform ${orgSwitcherOpen ? 'rotate-180' : ''}`}
              >
                <path d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z" />
              </svg>
            </button>
            {orgSwitcherOpen && (
              <div className="absolute left-2 right-2 top-full z-50 mt-1 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {orgList.map((org) => (
                  <Link
                    key={org.id}
                    href={`/o/${org.slug}/projects`}
                    onClick={() => setOrgSwitcherOpen(false)}
                    className={`flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${
                      currentOrg?.id === org.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                    }`}
                  >
                    <span className="truncate">{org.name}</span>
                    <span className="ml-2 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                      {org.role}
                    </span>
                  </Link>
                ))}
                <div className="border-t border-gray-100 mt-1 pt-1">
                  <Link
                    href="/orgs/new"
                    onClick={() => setOrgSwitcherOpen(false)}
                    className="flex items-center px-3 py-2 text-sm text-blue-600 hover:bg-blue-50"
                  >
                    + New organization
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {/* ── Project-level nav ── */}
          {isInProject && projectCtx && (
            <>
              <Link
                href={`/o/${projectCtx.orgSlug}/projects`}
                className="mb-3 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                {Icons.back}
                <span>Back to {projectCtx.orgName}</span>
              </Link>

              <div className="mb-3 rounded-md bg-gray-50 px-3 py-2">
                <p className="truncate text-xs font-semibold text-gray-900">{projectCtx.name}</p>
              </div>

              <NavLink
                href={`/p/${projectCtx.slug}/threads`}
                active={pathname.includes('/threads')}
                icon={Icons.chat}
              >
                Threads
              </NavLink>
              <NavLink
                href={`/p/${projectCtx.slug}/kanban`}
                active={pathname.includes('/kanban')}
                icon={Icons.kanban}
              >
                Kanban
              </NavLink>
              <button
                onClick={async () => {
                  if (!projectCtx) return;
                  try {
                    const detail = await projects.get(projectCtx.orgId, projectCtx.id) as { settings?: ProjectSettings };
                    const origin = typeof window !== 'undefined' ? window.location.origin : '';
                    const key = detail?.settings?.apiKey;
                    setWsEmbedCode(key ? `<script src="${origin}/static/overlay.js" data-key="${key}"></script>` : '');
                  } catch { setWsEmbedCode(''); }
                  setWsModalOpen(true);
                }}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors text-gray-600 hover:bg-gray-50 hover:text-gray-900`}
              >
                <span className="flex h-4 w-4 items-center justify-center text-current opacity-60">{Icons.monitor}</span>
                Workspace
              </button>
              <NavLink
                href={`/p/${projectCtx.slug}/settings`}
                active={pathname.endsWith('/settings')}
                icon={Icons.gear}
              >
                Settings
              </NavLink>
            </>
          )}

          {/* ── Org-level nav ── */}
          {!isInProject && currentOrg && (
            <>
              <SectionLabel>Organization</SectionLabel>
              <NavLink
                href={`/o/${currentOrg.slug}/projects`}
                active={pathname.includes('/projects')}
                icon={Icons.grid}
              >
                Projects
              </NavLink>
              <NavLink
                href={`/o/${currentOrg.slug}/members`}
                active={pathname.includes('/members')}
                icon={Icons.users}
              >
                Members
              </NavLink>
            </>
          )}

          {/* ── Top-level nav (no org context) ── */}
          {!isInProject && !currentOrg && (
            <>
              <NavLink href="/orgs" active={pathname === '/orgs'} icon={Icons.grid}>
                Organizations
              </NavLink>
            </>
          )}
        </nav>

        {/* ── User section ── */}
        <div className="border-t border-gray-100 p-3">
          <div className="flex items-center gap-2.5">
            <Link href="/settings" className="shrink-0">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover ring-1 ring-gray-200"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600 ring-1 ring-blue-200">
                  {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href="/settings" className="group block">
                <p className="truncate text-sm font-medium text-gray-900 group-hover:text-blue-600">
                  {user?.displayName}
                </p>
              </Link>
              <button
                onClick={handleLogout}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Breadcrumb */}
        {(currentOrg || isInProject) && (
          <header className="flex h-12 items-center border-b border-gray-100 bg-white px-6">
            <nav className="flex items-center gap-1 text-sm text-gray-500">
              <Link href="/orgs" className="hover:text-gray-700">
                Home
              </Link>
              {currentOrg && (
                <>
                  <span className="text-gray-300">/</span>
                  <Link
                    href={`/o/${currentOrg.slug}/projects`}
                    className="hover:text-gray-700"
                  >
                    {currentOrg.name}
                  </Link>
                </>
              )}
              {isInProject && projectCtx && (
                <>
                  <span className="text-gray-300">/</span>
                  <span className="font-medium text-gray-900">{projectCtx.name}</span>
                </>
              )}
            </nav>
          </header>
        )}

        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">{children}</main>
      </div>

      {/* Workspace Embed Modal */}
      {wsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Workspace</h2>
              <button
                onClick={() => { setWsModalOpen(false); setWsCopied(false); }}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-5">
              {projectCtx && (
                <a
                  href={`/p/${projectCtx.slug}/workspace`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                    <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Open Visual Workspace</p>
                    <p className="text-xs text-gray-500">Full-screen feedback workspace with visual pins</p>
                  </div>
                  <svg className="ml-auto h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}

              <div>
                <h3 className="text-sm font-medium text-gray-900">Embed Code</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Add this script before the closing <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">&lt;/body&gt;</code> tag to enable the feedback overlay.
                </p>
                {wsEmbedCode ? (
                  <div className="relative mt-3">
                    <pre className="rounded-lg bg-gray-900 p-4 text-sm text-green-400 overflow-x-auto">
                      {wsEmbedCode}
                    </pre>
                    <button
                      onClick={() => { navigator.clipboard.writeText(wsEmbedCode); setWsCopied(true); setTimeout(() => setWsCopied(false), 2000); }}
                      className="absolute right-2 top-2 rounded-md bg-gray-700 px-3 py-1 text-xs font-medium text-white hover:bg-gray-600"
                    >
                      {wsCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-gray-400">No API key configured for this project.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => { setWsModalOpen(false); setWsCopied(false); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
