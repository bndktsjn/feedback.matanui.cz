export type ViewMode = 'list' | 'detail';
export type Viewport = 'desktop' | 'tablet' | 'mobile';
export type StatusFilter = 'open' | 'resolved';
export type ScopeFilter = 'this_page' | 'all_pages';

export interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  orgId: string;
  settings?: {
    publicWorkspace?: boolean;
    allowAnonymousComments?: boolean;
    apiKey?: string;
  };
}

export interface DraftPin {
  /** Pin position — the primary anchor (Y in spec). Thread is identified by this. */
  pinX: number;
  pinY: number;
  /** Secondary control point (X in spec) — defines callout area geometry. Absent for point-only pins. */
  secondary?: { x: number; y: number };
}

export interface StatusCounts {
  open: number;
  resolved: number;
}

export interface IframeBridgeState {
  ready: boolean;
  pageUrl: string;
  pageTitle: string;
  docWidth: number;
  docHeight: number;
  vpWidth: number;
  vpHeight: number;
  scrollX: number;
  scrollY: number;
}
