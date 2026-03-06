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
  x: number;
  y: number;
  /** Area selection bounds — present when user dragged a rectangle */
  area?: { x2: number; y2: number };
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
