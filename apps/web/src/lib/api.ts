const API_BASE = '/api/v1';

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // Add CSRF token for mutations
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const csrf = getCsrfToken();
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body?.error?.message || res.statusText;
    throw new ApiError(res.status, message, body?.error?.code);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(typeof message === 'string' ? message : JSON.stringify(message));
    this.name = 'ApiError';
  }
}

// Auth
export const auth = {
  register: (data: { email: string; password: string; displayName: string }) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => apiFetch('/auth/logout', { method: 'POST' }),
  me: () => apiFetch<User>('/auth/me'),
  updateMe: (data: { displayName?: string; avatarUrl?: string }) =>
    apiFetch<User>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
  forgotPassword: (email: string) =>
    apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, newPassword: string) =>
    apiFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    }),
  verifyEmail: (token: string) =>
    apiFetch('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
};

// Orgs
export const orgs = {
  list: () => apiFetch<OrgWithRole[]>('/orgs'),
  create: (data: { name: string; slug?: string; billingEmail?: string }) =>
    apiFetch('/orgs', { method: 'POST', body: JSON.stringify(data) }),
  get: (orgId: string) => apiFetch(`/orgs/${orgId}`),
  update: (orgId: string, data: { name?: string; billingEmail?: string }) =>
    apiFetch(`/orgs/${orgId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (orgId: string) => apiFetch(`/orgs/${orgId}`, { method: 'DELETE' }),
  members: {
    list: (orgId: string) => apiFetch(`/orgs/${orgId}/members`),
    add: (orgId: string, data: { userId: string; role: string }) =>
      apiFetch(`/orgs/${orgId}/members`, { method: 'POST', body: JSON.stringify(data) }),
    update: (orgId: string, memberId: string, data: { role: string }) =>
      apiFetch(`/orgs/${orgId}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (orgId: string, memberId: string) =>
      apiFetch(`/orgs/${orgId}/members/${memberId}`, { method: 'DELETE' }),
  },
};

// Projects
export const projects = {
  list: (orgId: string) => apiFetch(`/orgs/${orgId}/projects`),
  create: (
    orgId: string,
    data: { name: string; slug?: string; baseUrl: string; description?: string },
  ) => apiFetch(`/orgs/${orgId}/projects`, { method: 'POST', body: JSON.stringify(data) }),
  get: (orgId: string, projectId: string) => apiFetch(`/orgs/${orgId}/projects/${projectId}`),
  update: (
    orgId: string,
    projectId: string,
    data: { name?: string; baseUrl?: string; description?: string },
  ) =>
    apiFetch(`/orgs/${orgId}/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (orgId: string, projectId: string) =>
    apiFetch(`/orgs/${orgId}/projects/${projectId}`, { method: 'DELETE' }),
};

// Threads
export const threads = {
  list: (projectId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<Thread[]>(`/projects/${projectId}/threads${qs}`);
  },
  create: (projectId: string, data: Record<string, unknown>) =>
    apiFetch<Thread>(`/projects/${projectId}/threads`, { method: 'POST', body: JSON.stringify(data) }),
  get: (projectId: string, threadId: string) =>
    apiFetch<Thread>(`/projects/${projectId}/threads/${threadId}`),
  update: (projectId: string, threadId: string, data: Record<string, unknown>) =>
    apiFetch<Thread>(`/projects/${projectId}/threads/${threadId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (projectId: string, threadId: string) =>
    apiFetch(`/projects/${projectId}/threads/${threadId}`, { method: 'DELETE' }),
  statusCounts: (projectId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<{ open: number; resolved: number }>(`/projects/${projectId}/threads/status-counts${qs}`);
  },
};

// Comments
export const comments = {
  list: (projectId: string, threadId: string) =>
    apiFetch(`/projects/${projectId}/threads/${threadId}/comments`),
  create: (projectId: string, threadId: string, data: { content: string }) =>
    apiFetch(`/projects/${projectId}/threads/${threadId}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (projectId: string, threadId: string, commentId: string, data: { content: string }) =>
    apiFetch(`/projects/${projectId}/threads/${threadId}/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (projectId: string, threadId: string, commentId: string) =>
    apiFetch(`/projects/${projectId}/threads/${threadId}/comments/${commentId}`, {
      method: 'DELETE',
    }),
};

// Types
export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrgWithRole {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface Thread {
  id: string;
  title: string;
  message: string;
  pageUrl: string;
  pageTitle?: string;
  status: string;
  priority: string;
  type: string;
  contextType: string;
  viewport: string;
  xPct: number | null;
  yPct: number | null;
  screenshotUrl: string | null;
  author: { id: string; email: string; displayName: string; avatarUrl: string | null };
  comments?: Comment[];
  environment?: Record<string, unknown> | null;
  _count: { comments: number };
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  content: string;
  author: { id: string; email: string; displayName: string; avatarUrl: string | null };
  createdAt: string;
  updatedAt: string;
}
