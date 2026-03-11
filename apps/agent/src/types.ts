export type Viewport = 'desktop' | 'tablet' | 'mobile';
export type StatusFilter = 'open' | 'resolved';
export type ScopeFilter = 'this_page' | 'all_pages';

export interface StatusCounts {
  open: number;
  resolved: number;
}

export interface DraftPin {
  pinX: number;
  pinY: number;
  secondary?: { x: number; y: number };
}

export interface Author {
  id: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface Attachment {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author?: Author | null;
  guestEmail?: string;
  attachments?: Attachment[];
}

export interface Thread {
  id: string;
  title?: string;
  message: string;
  status: string;
  priority?: string;
  type?: string;
  contextType?: string;
  pageUrl?: string;
  pageTitle?: string;
  viewport?: string;
  xPct?: number | null;
  yPct?: number | null;
  targetSelector?: string;
  anchorData?: unknown;
  screenshotUrl?: string | null;
  environment?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  author?: Author | null;
  guestEmail?: string;
  comments?: Comment[];
  attachments?: Attachment[];
  _count: { comments: number };
}

export interface ProjectConfig {
  projectId: string;
  projectName: string;
  baseUrl: string;
  settings: {
    publicWorkspace?: boolean;
    allowAnonymousComments?: boolean;
  };
}
