'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { orgs, OrgWithRole, OrgMember, OrgInvitation } from '@/lib/api';

type Tab = 'members' | 'invitations';

export default function MembersPage() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;

  const [org, setOrg] = useState<OrgWithRole | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<OrgInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('members');

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);

  // Feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Delete organization
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingOrg, setDeletingOrg] = useState(false);

  const canManage = org?.role === 'owner' || org?.role === 'admin';
  const isOwner = org?.role === 'owner';

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const orgList = await orgs.list();
      const found = orgList.find((o) => o.slug === orgSlug);
      if (!found) return;
      setOrg(found);

      const [memberList, inviteList] = await Promise.all([
        orgs.members.list(found.id),
        canManageForRole(found.role) ? orgs.invitations.list(found.id) : Promise.resolve([]),
      ]);
      setMembers(memberList);
      setPendingInvitations(inviteList);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!org || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await orgs.invitations.create(org.id, { email: inviteEmail.trim(), role: inviteRole });
      showToast(`Invitation sent to ${inviteEmail.trim()}`, 'success');
      setInviteEmail('');
      setInviteRole('member');
      // Reload invitations
      const inviteList = await orgs.invitations.list(org.id);
      setPendingInvitations(inviteList);
      setTab('invitations');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send invitation';
      showToast(msg, 'error');
    } finally {
      setInviting(false);
    }
  }

  async function handleRevokeInvite(invitationId: string) {
    if (!org) return;
    try {
      await orgs.invitations.revoke(org.id, invitationId);
      showToast('Invitation revoked', 'success');
      const inviteList = await orgs.invitations.list(org.id);
      setPendingInvitations(inviteList);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke invitation';
      showToast(msg, 'error');
    }
  }

  async function handleResendInvite(invitationId: string) {
    if (!org) return;
    try {
      await orgs.invitations.resend(org.id, invitationId);
      showToast('Invitation resent with a new link', 'success');
      const inviteList = await orgs.invitations.list(org.id);
      setPendingInvitations(inviteList);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend invitation';
      showToast(msg, 'error');
    }
  }

  async function handleChangeRole(memberId: string, newRole: string) {
    if (!org) return;
    try {
      await orgs.members.update(org.id, memberId, { role: newRole });
      showToast('Role updated', 'success');
      const memberList = await orgs.members.list(org.id);
      setMembers(memberList);
      window.dispatchEvent(new Event('role-changed'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update role';
      showToast(msg, 'error');
    }
  }

  async function handleRemoveMember(memberId: string, displayName: string) {
    if (!org) return;
    if (!confirm(`Remove ${displayName} from this organization?`)) return;
    try {
      await orgs.members.remove(org.id, memberId);
      showToast('Member removed', 'success');
      const memberList = await orgs.members.list(org.id);
      setMembers(memberList);
      window.dispatchEvent(new Event('role-changed'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove member';
      showToast(msg, 'error');
    }
  }

  // ── Delete Organization ──

  async function handleDeleteOrganization() {
    if (!org) return;
    setDeletingOrg(true);
    try {
      await orgs.delete(org.id);
      showToast('Organization deleted successfully', 'success');
      // Redirect to organizations list after a short delay
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete organization';
      showToast(msg, 'error');
    } finally {
      setDeletingOrg(false);
    }
  }

  if (loading) return <div className="text-gray-500">Loading...</div>;
  if (!org) return <div className="text-gray-500">Organization not found.</div>;

  const pendingInvites = pendingInvitations.filter((i) => i.status === 'pending');
  const pastInvites = pendingInvitations.filter((i) => i.status !== 'pending');

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href={`/o/${orgSlug}/projects`} className="hover:text-gray-700">
            {org.name}
          </Link>
          <span>/</span>
          <span>Members</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Team Members</h1>
      </div>

      {/* Invite form (owner/admin only) */}
      {canManage && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">Invite a new member</h2>
          <form onSubmit={handleInvite} className="mt-3 flex items-end gap-3">
            <div className="flex-1">
              <label htmlFor="invite-email" className="block text-xs font-medium text-gray-600">
                Email address
              </label>
              <input
                id="invite-email"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="w-36">
              <label htmlFor="invite-role" className="block text-xs font-medium text-gray-600">
                Role
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
          </form>
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
            onClick={() => setTab('invitations')}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              tab === 'invitations'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Invitations
            {pendingInvites.length > 0 && (
              <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-yellow-100 text-xs font-semibold text-yellow-800">
                {pendingInvites.length}
              </span>
            )}
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
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Joined</th>
                {canManage && <th className="px-5 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
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
                    {canManage && member.role !== 'owner' ? (
                      <select
                        value={member.role}
                        onChange={(e) => handleChangeRole(member.id, e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                    ) : (
                      <RoleBadge role={member.role} />
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {new Date(member.joinedAt).toLocaleDateString()}
                  </td>
                  {canManage && (
                    <td className="px-5 py-3 text-right">
                      {member.role !== 'owner' && (
                        <button
                          onClick={() => handleRemoveMember(member.id, member.user.displayName)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invitations tab */}
      {tab === 'invitations' && canManage && (
        <div className="space-y-6">
          {/* Pending invitations */}
          {pendingInvites.length > 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-5 py-3">
                <h3 className="text-sm font-semibold text-gray-700">Pending Invitations</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Invited by</th>
                    <th className="px-5 py-3">Sent</th>
                    <th className="px-5 py-3">Expires</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pendingInvites.map((invite) => (
                    <tr key={invite.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm text-gray-900">{invite.email}</td>
                      <td className="px-5 py-3">
                        <RoleBadge role={invite.role} />
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {invite.invitedBy.displayName}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {new Date(invite.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              const link = `${window.location.origin}/invite/${invite.token}`;
                              navigator.clipboard.writeText(link);
                              showToast('Invite link copied to clipboard', 'success');
                            }}
                            className="text-xs text-gray-600 hover:text-gray-800"
                          >
                            Copy link
                          </button>
                          <button
                            onClick={() => handleResendInvite(invite.id)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Resend
                          </button>
                          <button
                            onClick={() => handleRevokeInvite(invite.id)}
                            className="text-xs text-red-600 hover:text-red-800"
                          >
                            Revoke
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white px-5 py-8 text-center text-sm text-gray-500">
              No pending invitations. Use the form above to invite team members.
            </div>
          )}

          {/* Past invitations */}
          {pastInvites.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-5 py-3">
                <h3 className="text-sm font-semibold text-gray-700">Past Invitations</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pastInvites.map((invite) => (
                    <tr key={invite.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm text-gray-900">{invite.email}</td>
                      <td className="px-5 py-3">
                        <RoleBadge role={invite.role} />
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={invite.status} />
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {new Date(invite.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Delete Organization (Owner Only) ── */}
      {isOwner && (
        <section className="mt-8 rounded-lg border border-red-200 bg-white">
          <div className="border-b border-red-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-red-700">Danger Zone</h2>
            <p className="mt-1 text-sm text-red-600">
              Irreversible actions that affect your entire organization
            </p>
          </div>
          <div className="p-6">
            {!showDeleteConfirm ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Delete organization</p>
                  <p className="text-sm text-gray-500">
                    Permanently delete this organization, all its projects, and associated data. This action cannot be undone.
                  </p>
                </div>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="ml-4 shrink-0 rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Delete organization
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md bg-red-50 p-4">
                  <p className="text-sm font-medium text-red-800">
                    Are you sure? This will permanently delete the organization "{org.name}", all its projects, threads, comments, and attachments. This cannot be undone.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleDeleteOrganization}
                    disabled={deletingOrg}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deletingOrg ? 'Deleting...' : 'Yes, delete organization'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
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

function RoleBadge({ role }: { role: string }) {
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    accepted: 'bg-green-100 text-green-800',
    revoked: 'bg-red-100 text-red-800',
    expired: 'bg-yellow-100 text-yellow-800',
    pending: 'bg-blue-100 text-blue-800',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colors[status] || 'bg-gray-100 text-gray-700'}`}
    >
      {status}
    </span>
  );
}
