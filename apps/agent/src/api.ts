import type { Thread, Comment, ProjectConfig, StatusCounts } from './types';

let API_BASE = '';
let API_KEY = '';

export function initApi(base: string, key: string) {
  API_BASE = base;
  API_KEY = key;
}

function url(path: string): string {
  const sep = path.indexOf('?') > -1 ? '&' : '?';
  return API_BASE + path + sep + 'key=' + encodeURIComponent(API_KEY);
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(url(path));
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(url(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(url(path), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

async function del(path: string): Promise<void> {
  const r = await fetch(url(path), { method: 'DELETE' });
  if (!r.ok) throw new Error(r.statusText);
}

export const api = {
  getConfig: () => get<ProjectConfig>('/v1/overlay/config'),

  getThreads: (params: Record<string, string> = {}) => {
    const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    return get<Thread[]>('/v1/overlay/threads' + (qs ? '?' + qs : ''));
  },

  getThread: (id: string) => get<Thread>('/v1/overlay/threads/' + id),

  createThread: (data: Record<string, unknown>) =>
    post<Thread>('/v1/overlay/threads', data),

  updateThread: (id: string, data: Record<string, unknown>) =>
    patch<Thread>('/v1/overlay/threads/' + id, data),

  createComment: (threadId: string, data: { content: string; guestEmail?: string }) =>
    post<Comment>('/v1/overlay/threads/' + threadId + '/comments', data),

  getStatusCounts: (params: Record<string, string> = {}): Promise<StatusCounts> => {
    // The overlay API returns threads, so we compute counts client-side
    return api.getThreads(params).then(threads => ({
      open: threads.filter(t => t.status === 'open').length,
      resolved: threads.filter(t => t.status === 'resolved').length,
    }));
  },
};

// Offline queue
const QUEUE_KEY = 'fb_agent_queue';

export function getQueue(): Record<string, unknown>[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}

export function saveQueue(q: Record<string, unknown>[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* quota */ }
}

export function enqueue(payload: Record<string, unknown>) {
  const q = getQueue();
  payload._queuedAt = Date.now();
  q.push(payload);
  saveQueue(q);
}

export async function flushQueue(): Promise<number> {
  const q = getQueue();
  if (!q.length) return 0;
  saveQueue([]);
  const failed: Record<string, unknown>[] = [];
  for (const item of q) {
    try {
      const payload = { ...item };
      delete payload._queuedAt;
      await api.createThread(payload);
    } catch {
      failed.push(item);
    }
  }
  if (failed.length) saveQueue([...failed, ...getQueue()]);
  return q.length - failed.length;
}
