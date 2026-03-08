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
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),
  changeEmail: (data: { newEmail: string; password: string }) =>
    apiFetch<User>('/auth/change-email', { method: 'POST', body: JSON.stringify(data) }),
  avatarUploadUrl: (data: { filename: string; mimeType: string }) =>
    apiFetch<{ storageKey: string; uploadUrl: string; publicUrl: string }>(
      '/auth/avatar-upload-url',
      { method: 'POST', body: JSON.stringify(data) },
    ),
  deleteAccount: (password: string) =>
    apiFetch('/auth/account', { method: 'DELETE', body: JSON.stringify({ password }) }),
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
    list: (orgId: string) => apiFetch<OrgMember[]>(`/orgs/${orgId}/members`),
    add: (orgId: string, data: { userId: string; role: string }) =>
      apiFetch(`/orgs/${orgId}/members`, { method: 'POST', body: JSON.stringify(data) }),
    update: (orgId: string, memberId: string, data: { role: string }) =>
      apiFetch<OrgMember>(`/orgs/${orgId}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (orgId: string, memberId: string) =>
      apiFetch(`/orgs/${orgId}/members/${memberId}`, { method: 'DELETE' }),
  },
  invitations: {
    list: (orgId: string) => apiFetch<OrgInvitation[]>(`/orgs/${orgId}/invitations`),
    create: (orgId: string, data: { email: string; role?: string }) =>
      apiFetch<OrgInvitation>(`/orgs/${orgId}/invitations`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    revoke: (orgId: string, invitationId: string) =>
      apiFetch(`/orgs/${orgId}/invitations/${invitationId}`, { method: 'DELETE' }),
    resend: (orgId: string, invitationId: string) =>
      apiFetch(`/orgs/${orgId}/invitations/${invitationId}/resend`, { method: 'POST' }),
  },
};

// Invitations (public token-based)
export const invitations = {
  getByToken: (token: string) => apiFetch<InvitationDetail>(`/invitations/${token}`),
  accept: (token: string) =>
    apiFetch<InvitationAcceptResult>(`/invitations/${token}/accept`, { method: 'POST' }),
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
    data: { name?: string; baseUrl?: string; description?: string; publicWorkspace?: boolean; allowAnonymousComments?: boolean },
  ) =>
    apiFetch(`/orgs/${orgId}/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (orgId: string, projectId: string) =>
    apiFetch(`/orgs/${orgId}/projects/${projectId}`, { method: 'DELETE' }),
  publicBySlug: (slug: string) =>
    apiFetch<Project>(`/public/projects/by-slug/${slug}`),
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

// Attachments
export const attachments = {
  presign: (data: { attachableType: string; attachableId: string; filename: string; mimeType: string }) =>
    apiFetch<{ uploadUrl: string; publicUrl: string; storageKey: string }>('/attachments/presign', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  confirm: (data: {
    attachableType: string;
    attachableId: string;
    filename: string;
    storageKey: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
  }) =>
    apiFetch<AttachmentInfo>('/attachments/confirm', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  list: (attachableType: string, attachableId: string) =>
    apiFetch<AttachmentInfo[]>(`/attachments?attachableType=${attachableType}&attachableId=${attachableId}`),
  delete: (id: string) =>
    apiFetch(`/attachments/${id}`, { method: 'DELETE' }),
  /** High-level helper: presign → PUT to S3 → confirm. Returns the created attachment. */
  async uploadFile(
    file: File,
    attachableType: string,
    attachableId: string,
    onProgress?: (pct: number) => void,
  ): Promise<AttachmentInfo> {
    const { uploadUrl, publicUrl, storageKey } = await this.presign({
      attachableType,
      attachableId,
      filename: file.name,
      mimeType: file.type,
    });
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed')));
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(file);
    });
    return this.confirm({
      attachableType,
      attachableId,
      filename: file.name,
      storageKey,
      url: publicUrl,
      mimeType: file.type,
      sizeBytes: file.size,
    }) as Promise<AttachmentInfo>;
  },
};

// Project Members
export const projectMembers = {
  list: (projectId: string) =>
    apiFetch<ProjectMember[]>(`/projects/${projectId}/members`),
  available: (projectId: string) =>
    apiFetch<AvailableOrgMember[]>(`/projects/${projectId}/members/available`),
  add: (projectId: string, data: { userId: string; role: string }) =>
    apiFetch<ProjectMember>(`/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (projectId: string, memberId: string, data: { role: string }) =>
    apiFetch<ProjectMember>(`/projects/${projectId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  remove: (projectId: string, memberId: string) =>
    apiFetch(`/projects/${projectId}/members/${memberId}`, { method: 'DELETE' }),
};

// User search (for @mentions)
export const users = {
  search: (projectId: string, query?: string) => {
    const qs = query ? `?q=${encodeURIComponent(query)}` : '';
    return apiFetch<ProjectMemberUser[]>(`/projects/${projectId}/members/search${qs}`);
  },
};

// Comments
export const comments = {
  list: (projectId: string, threadId: string) =>
    apiFetch(`/projects/${projectId}/threads/${threadId}/comments`),
  create: (projectId: string, threadId: string, data: { content: string; guestEmail?: string }) =>
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

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  role: string;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface OrgInvitation {
  id: string;
  orgId: string;
  email: string;
  role: string;
  token: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: {
    id: string;
    email: string;
    displayName: string;
  };
  acceptedBy?: {
    id: string;
    email: string;
    displayName: string;
  } | null;
}

export interface InvitationDetail {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  invitedBy: {
    id: string;
    displayName: string;
  };
}

export interface InvitationAcceptResult {
  alreadyMember: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  membership?: OrgMember;
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
  anchorData?: string | null;
  targetSelector?: string | null;
  guestEmail?: string | null;
  author: { id: string; email: string; displayName: string; avatarUrl: string | null } | null;
  comments?: Comment[];
  environment?: Record<string, unknown> | null;
  _count: { comments: number };
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  content: string;
  guestEmail?: string | null;
  author: { id: string; email: string; displayName: string; avatarUrl: string | null } | null;
  attachments?: AttachmentInfo[];
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentInfo {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ProjectMemberUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ProjectSettings {
  apiKey?: string;
  publicWorkspace?: boolean;
  allowAnonymousComments?: boolean;
}

export interface Project {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  baseUrl: string;
  description?: string;
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface AvailableOrgMember {
  id: string;
  userId: string;
  orgRole: string;
  assigned: boolean;
  projectRole: string | null;
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
}
