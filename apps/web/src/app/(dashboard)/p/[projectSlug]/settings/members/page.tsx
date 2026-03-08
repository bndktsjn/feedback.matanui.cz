'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  orgs,
  projects,
  projectMembers as projectMembersApi,
  OrgWithRole,
  ProjectMember,
  AvailableOrgMember,
} from '@/lib/api';

type Tab = 'members' | 'add';

interface ProjectDetail {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  baseUrl: string;
  description?: string;
  settings: { apiKey?: string; publicWorkspace?: boolean; allowAnonymousComments?: boolean };
}

export default function ProjectMembersPage() {
  const params = useParams();
  const projectSlug = params.projectSlug as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [org, setOrg] = useState<OrgWithRole | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>('member');
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [availableMembers, setAvailableMembers] = useState<AvailableOrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('members');

  // Add member form
  const [selectedUserId, setSelectedUserId] = useState('');
  const [addRole, setAddRole] = useState('member');
  const [adding, setAdding] = useState(false);

  // Feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const canManage = currentUserRole === 'admin';

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const orgList = await orgs.list();
      for (const o of orgList) {
        const projList = (await projects.list(o.id)) as { id: string; slug: string; currentUserRole?: string }[];
        const found = projList.find((p) => p.slug === projectSlug);
        if (found) {
          const detail = (await projects.get(o.id, found.id)) as ProjectDetail;
          setProject(detail);
          setOrg(o);
          const resolvedRole = found.currentUserRole || (o.role === 'owner' || o.role === 'admin' ? 'admin' : 'member');
          setCurrentUserRole(resolvedRole);
          const memberList = await projectMembersApi.list(detail.id);
          setMembers(memberList);
          if (resolvedRole === 'admin') {
            try {
              const available = await projectMembersApi.available(detail.id);
              setAvailableMembers(available);
            } catch {
              /* may lack permission */
            }
          }
          break;
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [projectSlug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!project || !selectedUserId) return;
    setAdding(true);
    try {
      await projectMembersApi.add(project.id, { userId: selectedUserId, role: addRole });
      showToast('Member added to project', 'success');
      setSelectedUserId('');
      setAddRole('member');
      // Reload
      const [memberList, available] = await Promise.all([
        projectMembersApi.list(project.id),
        projectMembersApi.available(project.id).catch(() => [] as AvailableOrgMember[]),
      ]);
      setMembers(memberList);
      setAvailableMembers(available);
      setTab('members');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add member';
      showToast(msg, 'error');
    } finally {
      setAdding(false);
    }
  }

  async function handleChangeRole(memberId: string, newRole: string) {
    if (!project) return;
    try {
      await projectMembersApi.update(project.id, memberId, { role: newRole });
      showToast('Role updated', 'success');
      const memberList = await projectMembersApi.list(project.id);
      setMembers(memberList);
      window.dispatchEvent(new Event('role-changed'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update role';
      showToast(msg, 'error');
    }
  }

  async function handleRemoveMember(memberId: string, displayName: string) {
    if (!project) return;
    if (!confirm(`Remove ${displayName} from this project?`)) return;
    try {
      await projectMembersApi.remove(project.id, memberId);
      showToast('Member removed', 'success');
      const [memberList, available] = await Promise.all([
        projectMembersApi.list(project.id),
        projectMembersApi.available(project.id).catch(() => [] as AvailableOrgMember[]),
      ]);
      setMembers(memberList);
      setAvailableMembers(available);
      window.dispatchEvent(new Event('role-changed'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove member';
      showToast(msg, 'error');
    }
  }

  if (loading) return <div className="text-gray-500">Loading...</div>;
  if (!project || !org) return <div className="text-gray-500">Project not found.</div>;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href={`/o/${org.slug}/projects`} className="hover:text-gray-700">
            {org.name}
          </Link>
          <span>/</span>
          <Link href={`/p/${projectSlug}/settings`} className="hover:text-gray-700">
            {project.name}
          </Link>
          <span>/</span>
          <span>Members</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Project Members</h1>
        <p className="mt-1 text-sm text-gray-500">
          Organization owners and admins automatically have access to all projects.
          Add specific members here for granular access control.
        </p>
      </div>

      {/* Add member form (admin only) */}
      {canManage && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">Add a project member</h2>
          <p className="mt-1 text-xs text-gray-500">
            Select from your organization&apos;s members who are not yet assigned to this project.
          </p>
          <form onSubmit={handleAddMember} className="mt-3 flex items-end gap-3">
            <div className="flex-1">
              <label htmlFor="add-member-select" className="block text-xs font-medium text-gray-600">
                Organization member
              </label>
              <select
                id="add-member-select"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              >
                <option value="">Select a member…</option>
                {availableMembers.map((m) => (
                  <option
                    key={m.userId}
                    value={m.userId}
                    disabled={m.assigned}
                  >
                    {m.user.displayName} ({m.user.email}) — org: {m.orgRole}
                    {m.assigned ? ' (already assigned)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-36">
              <label htmlFor="add-member-role" className="block text-xs font-medium text-gray-600">
                Project role
              </label>
              <select
                id="add-member-role"
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="viewer">Viewer</option>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={adding || !selectedUserId}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {adding ? 'Adding...' : 'Add Member'}
            </button>
          </form>
          {availableMembers.length > 0 && availableMembers.every((m) => m.assigned) && (
            <p className="mt-3 text-xs text-gray-400">
              All organization members are already assigned to this project.
            </p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex border-b border-gray-200">
        <button
          onClick={() => setTab('members')}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            tab === 'members'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Members ({members.length})
        </button>
        {canManage && (
          <button
            onClick={() => setTab('add')}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              tab === 'add'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Org Access Overview
          </button>
        )}
      </div>

      {/* Members tab */}
      {tab === 'members' && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                <th className="px-5 py-3">Member</th>
                <th className="px-5 py-3">Project Role</th>
                <th className="px-5 py-3">Joined</th>
                {canManage && <th className="px-5 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {members.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 4 : 3} className="px-5 py-8 text-center text-sm text-gray-500">
                    No explicit project members yet. Organization owners and admins have implicit access.
                  </td>
                </tr>
              )}
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-600">
                        {member.user.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{member.user.displayName}</p>
                        <p className="text-xs text-gray-500">{member.user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {canManage ? (
                      <select
                        value={member.role}
                        onChange={(e) => handleChangeRole(member.id, e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <ProjectRoleBadge role={member.role} />
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {new Date(member.joinedAt).toLocaleDateString()}
                  </td>
                  {canManage && (
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleRemoveMember(member.id, member.user.displayName)}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Org access overview tab */}
      {tab === 'add' && canManage && (
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="mb-4 rounded-lg bg-blue-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-700">Who can access this project?</h3>
              <p className="mt-1 text-xs text-gray-500">
                Only users explicitly added to the project can see and interact with it.
                Use the &ldquo;Add Members&rdquo; tab to assign organization members.
              </p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-5 py-3">Member</th>
                  <th className="px-5 py-3">Org Role</th>
                  <th className="px-5 py-3">Project Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {/* Assigned members */}
                {availableMembers
                  .filter((m) => m.assigned)
                  .map((m) => (
                    <tr key={`assigned-${m.userId}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-600">
                            {m.user.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{m.user.displayName}</p>
                            <p className="text-xs text-gray-500">{m.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <OrgRoleBadge role={m.orgRole} />
                      </td>
                      <td className="px-5 py-3">
                        <ProjectRoleBadge role={m.projectRole || 'member'} />
                      </td>
                    </tr>
                  ))}
                {/* Unassigned org members */}
                {availableMembers
                  .filter((m) => !m.assigned)
                  .map((m) => (
                    <tr key={`unassigned-${m.userId}`} className="opacity-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-400">
                            {m.user.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-600">{m.user.displayName}</p>
                            <p className="text-xs text-gray-400">{m.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <OrgRoleBadge role={m.orgRole} />
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                          Not assigned
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

function canManageForRole(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

function ProjectRoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: 'bg-blue-100 text-blue-800',
    member: 'bg-gray-100 text-gray-700',
    viewer: 'bg-yellow-100 text-yellow-800',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colors[role] || 'bg-gray-100 text-gray-700'}`}
    >
      {role}
    </span>
  );
}

function OrgRoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    owner: 'bg-purple-100 text-purple-800',
    admin: 'bg-blue-100 text-blue-800',
    member: 'bg-gray-100 text-gray-700',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colors[role] || 'bg-gray-100 text-gray-700'}`}
    >
      {role}
    </span>
  );
}
