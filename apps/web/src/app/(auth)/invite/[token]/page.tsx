'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, invitations, InvitationDetail, User } from '@/lib/api';

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'preview'; invitation: InvitationDetail; user: User | null }
  | { kind: 'accepted'; orgSlug: string; orgName: string; alreadyMember: boolean }
  | { kind: 'login'; invitation: InvitationDetail };

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const invitation = await invitations.getByToken(token);
        // Check if user is logged in
        let user: User | null = null;
        try {
          user = await auth.me();
        } catch {
          // Not logged in
        }

        if (user) {
          setState({ kind: 'preview', invitation, user });
        } else {
          setState({ kind: 'login', invitation });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid or expired invitation link.';
        setState({ kind: 'error', message: msg });
      }
    }
    load();
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    try {
      const result = await invitations.accept(token);
      setState({
        kind: 'accepted',
        orgSlug: result.organization.slug,
        orgName: result.organization.name,
        alreadyMember: result.alreadyMember,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to accept invitation.';
      setState({ kind: 'error', message: msg });
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Loading */}
        {state.kind === 'loading' && (
          <div className="rounded-lg bg-white p-8 text-center shadow-sm">
            <div className="text-gray-500">Loading invitation...</div>
          </div>
        )}

        {/* Error */}
        {state.kind === 'error' && (
          <div className="rounded-lg bg-white p-8 shadow-sm">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Invalid Invitation</h2>
              <p className="mt-2 text-sm text-gray-600">{state.message}</p>
              <p className="mt-4 text-sm text-gray-500">
                Please contact the organization administrator to request a new invitation.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Go to Login
              </Link>
            </div>
          </div>
        )}

        {/* Preview (logged in) */}
        {state.kind === 'preview' && (
          <div className="rounded-lg bg-white p-8 shadow-sm">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Join Organization</h2>
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-medium">{state.invitation.invitedBy.displayName}</span> has
                invited you to join{' '}
                <span className="font-medium">{state.invitation.organization.name}</span> as a{' '}
                <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 capitalize">
                  {state.invitation.role}
                </span>
              </p>
              <p className="mt-3 text-xs text-gray-500">
                Signed in as <span className="font-medium">{state.user?.email}</span>
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {accepting ? 'Joining...' : 'Accept & Join'}
                </button>
                <Link
                  href="/orgs"
                  className="w-full rounded-md border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Decline
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Not logged in */}
        {state.kind === 'login' && (
          <div className="rounded-lg bg-white p-8 shadow-sm">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Join Organization</h2>
              <p className="mt-2 text-sm text-gray-600">
                You&apos;ve been invited to join{' '}
                <span className="font-medium">{state.invitation.organization.name}</span> as a{' '}
                <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 capitalize">
                  {state.invitation.role}
                </span>
              </p>
              <p className="mt-4 text-sm text-gray-500">
                Please sign in or create an account to accept this invitation.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <Link
                  href={`/login?redirect=/invite/${token}`}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
                >
                  Sign In
                </Link>
                <Link
                  href={`/register?redirect=/invite/${token}`}
                  className="w-full rounded-md border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Create Account
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Accepted */}
        {state.kind === 'accepted' && (
          <div className="rounded-lg bg-white p-8 shadow-sm">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                {state.alreadyMember ? 'Already a Member' : 'Welcome!'}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {state.alreadyMember
                  ? `You're already a member of ${state.orgName}.`
                  : `You've successfully joined ${state.orgName}.`}
              </p>
              <Link
                href={`/o/${state.orgSlug}/projects`}
                className="mt-6 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Go to Organization
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
