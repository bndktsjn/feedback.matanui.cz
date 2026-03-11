'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { threads as threadsApi, attachments as attachmentsApi, orgs, projects, auth, Thread, User, ProjectSettings } from '@/lib/api';
import { ProjectInfo, Viewport, StatusFilter, ScopeFilter, ViewMode, DraftPin, StatusCounts } from './types';
import type { StagedFile } from './components/Composer';
import { useBridge } from './hooks/useBridge';
import { canonicalUrl } from './lib/utils';
import { getEnvironment } from './lib/environment';
import { captureScreenshot, screenshotBlobToFile } from './lib/screenshot';
import Toolbar from './components/Toolbar';
import IframeViewer from './components/IframeViewer';
import PinOverlay from './components/PinOverlay';
import SidePanel from './components/SidePanel';
import Toast from './components/Toast';
import ConfirmDialog from './components/ConfirmDialog';
import EnvironmentPopover from './components/EnvironmentPopover';
import { PreviewPopover, ThreadPopover } from './components/Popover';
import { IconMousePointerClick } from './components/Icons';

export default function WorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectSlug = params.projectSlug as string;

  /* ── Core state ─────────────────────────────────────────────── */
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [allowAnonymousComments, setAllowAnonymousComments] = useState(false);
  const [guestEmail, setGuestEmail] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('wpf-guest-email') || '';
    return '';
  });

  const [panelOpen, setPanelOpen] = useState(true);
  const [panelHidden, setPanelHidden] = useState(false); // auto-hide during pin drag
  const [pinMode, setPinMode] = useState(true);

  // Filters — URL params take priority over localStorage
  const [viewport, setViewport] = useState<Viewport>(() => {
    const urlVp = searchParams.get('viewport');
    if (urlVp && ['desktop', 'tablet', 'mobile'].includes(urlVp)) return urlVp as Viewport;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('wpf-viewport');
      if (stored && ['desktop', 'tablet', 'mobile'].includes(stored)) return stored as Viewport;
    }
    return 'desktop';
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('this_page');

  // Thread data
  const [threadList, setThreadList] = useState<Thread[]>([]);
  const [statusCnts, setStatusCnts] = useState<StatusCounts>({ open: 0, resolved: 0 });
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Pin hover / popover state
  const [hoveredThread, setHoveredThread] = useState<Thread | null>(null);
  const [hoveredPinRect, setHoveredPinRect] = useState<DOMRect | null>(null);
  const [popoverThread, setPopoverThread] = useState<Thread | null>(null);
  const [popoverPinRect, setPopoverPinRect] = useState<DOMRect | null>(null);

  // Draft pin
  const [draftPin, setDraftPin] = useState<DraftPin | null>(null);

  // Confirm dialog
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // Environment popover
  const [envData, setEnvData] = useState<{ env: Record<string, unknown>; rect: DOMRect } | null>(null);

  // 2.1: Track popover thread before drag for restoration
  const preDragPopoverThread = useRef<Thread | null>(null);

  // 1.2: Iframe ref for navigation tracking
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  /* ── Bridge — single source of truth for iframe ↔ parent comm ── */
  const bridge = useBridge(iframeRef, project?.baseUrl, () => setPinMode((v) => !v));
  const currentPageUrl = bridge.currentPageUrl;
  // Ref always holds the latest URL — used by handleCreateThread to avoid stale closures
  const currentPageUrlRef = useRef(currentPageUrl);
  currentPageUrlRef.current = currentPageUrl;

  // Reset pin/popover state on page navigation
  const prevPageUrl = useRef('');
  useEffect(() => {
    if (prevPageUrl.current && prevPageUrl.current !== currentPageUrl && currentPageUrl) {
      console.log('[Workspace] Page changed', { from: prevPageUrl.current, to: currentPageUrl });
      setDraftPin(null);
      setPopoverThread(null);
      setPopoverPinRect(null);
      setHoveredThread(null);
      setHoveredPinRect(null);
    }
    prevPageUrl.current = currentPageUrl;
  }, [currentPageUrl]);

  /* ── Toast helper ───────────────────────────────────────────── */
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  /* ── Load project ───────────────────────────────────────────── */
  useEffect(() => {
    async function load() {
      // Try authenticated access first
      let authenticated = false;
      try {
        const [user, orgList] = await Promise.all([auth.me(), orgs.list()]);
        setCurrentUser(user);
        authenticated = true;
        for (const org of orgList) {
          const projList = (await projects.list(org.id)) as unknown as ProjectInfo[];
          const found = projList.find((p) => p.slug === projectSlug);
          if (found) {
            setProject(found);
            setUserRole(org.role || '');
            // Check project settings for anonymous comments capability
            try {
              const detail = await projects.get(org.id, found.id) as { settings?: ProjectSettings };
              if (detail.settings) {
                setAllowAnonymousComments(!!detail.settings.allowAnonymousComments);
              }
            } catch { /* ignore */ }
            break;
          }
        }
      } catch {
        // Not authenticated — try public access
      }

      // If not authenticated, try public project lookup
      if (!authenticated) {
        try {
          const pub = await projects.publicBySlug(projectSlug) as unknown as ProjectInfo & { settings?: ProjectSettings };
          setProject(pub);
          setIsAnonymous(true);
          setAllowAnonymousComments(!!pub.settings?.allowAnonymousComments);
        } catch {
          // Project not found or not public
        }
      }

      setLoading(false);
    }
    load();
  }, [projectSlug]);

  /* ── Load threads ───────────────────────────────────────────── */
  const loadThreads = useCallback(async () => {
    if (!project) return;
    // Read URL from ref (always fresh) instead of closure (may be stale)
    const url = currentPageUrlRef.current;
    const p: Record<string, string> = { status: statusFilter, viewport, per_page: '100' };
    if (scopeFilter === 'this_page') p.pageUrl = url;
    
    console.log('🔍 Loading threads:', {
      projectId: project.id,
      currentPageUrl: url,
      scopeFilter,
      params: p,
    });
    
    try {
      const [list, counts] = await Promise.all([
        threadsApi.list(project.id, p),
        threadsApi.statusCounts(project.id, {
          viewport,
          ...(scopeFilter === 'this_page' ? { pageUrl: url } : {}),
        }),
      ]);
      
      console.log('📊 Loaded threads:', {
        count: list.length,
        threads: list.map(t => ({ id: t.id, pageUrl: t.pageUrl, xPct: t.xPct, yPct: t.yPct })),
        counts,
      });
      
      // Normalize Prisma Decimal strings to numbers for xPct/yPct
      const normalized = list.map((t) => ({
        ...t,
        xPct: t.xPct != null ? Number(t.xPct) : null,
        yPct: t.yPct != null ? Number(t.yPct) : null,
        _count: t._count ?? { comments: 0 },
      }));
      setThreadList(normalized);
      setStatusCnts(counts);
    } catch (error) {
      console.error('❌ Failed to load threads:', error);
    }
  }, [project, statusFilter, viewport, scopeFilter, currentPageUrl]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Deep-link: open a specific thread from URL params (?thread=<id>&viewport=<vp>)
  // 2.2: Restore viewport from URL and open popover next to pin
  const deepLinked = useRef(false);
  useEffect(() => {
    if (!project || deepLinked.current) return;
    const threadId = searchParams.get('thread');
    if (!threadId) return;
    deepLinked.current = true;

    // Restore viewport from URL param
    const vpParam = searchParams.get('viewport') as 'desktop' | 'tablet' | 'mobile' | null;
    if (vpParam && ['desktop', 'tablet', 'mobile'].includes(vpParam) && vpParam !== viewport) {
      setViewport(vpParam);
    }

    threadsApi.get(project.id, threadId).then((thread) => {
      // Wait for pins to render, then open popover next to the pin
      setTimeout(() => {
        const pinEl = document.querySelector(`[data-thread-id="${thread.id}"]`);
        if (pinEl) {
          setPopoverThread(thread);
          setPopoverPinRect(pinEl.getBoundingClientRect());
        } else {
          // Fallback: open in sidebar if pin not visible
          setActiveThread(thread);
          setViewMode('detail');
          if (!panelOpen) setPanelOpen(true);
        }
      }, 500);
    }).catch(() => { /* thread not found — ignore */ });
  }, [project, searchParams, panelOpen, viewport]);

  // Poll for updates every 10 seconds
  useEffect(() => {
    if (!project) return;
    const interval = setInterval(() => {
      console.log('🔄 Polling for thread updates...');
      loadThreads();
    }, 10000);
    return () => clearInterval(interval);
  }, [project, loadThreads]);

  // Direct bridge URL listener — catches FB_READY/FB_NAVIGATED even if
  // useBridge's internal state update doesn't propagate to loadThreads
  useEffect(() => {
    function onBridgeUrl(e: MessageEvent) {
      const d = e.data;
      if (!d || typeof d.type !== 'string') return;
      if ((d.type === 'FB_READY' || d.type === 'FB_NAVIGATED') && d.pageUrl) {
        const url = canonicalUrl(d.pageUrl);
        if (url && url !== currentPageUrlRef.current) {
          console.log('[page] Bridge URL change detected:', { from: currentPageUrlRef.current, to: url });
          currentPageUrlRef.current = url;
          // Force immediate thread reload with new URL
          loadThreads();
        }
      }
    }
    window.addEventListener('message', onBridgeUrl);
    return () => window.removeEventListener('message', onBridgeUrl);
  }, [loadThreads]);

  /* ── Keyboard shortcuts ─────────────────────────────────────── */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if ((e.key === 'i' || e.key === 'I') && !isEditable) {
        setPinMode((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') {
        if (envData) { setEnvData(null); return; }
        if (confirm) { setConfirm(null); return; }
        if (popoverThread) { setPopoverThread(null); setPopoverPinRect(null); return; }
        if (draftPin) { setDraftPin(null); return; }
        if (!pinMode) { setPinMode(true); return; }
        if (viewMode === 'detail') { setViewMode('list'); setActiveThread(null); return; }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pinMode, draftPin, viewMode, popoverThread, confirm, envData]);

  // 1.3: Recapture window focus after iframe steals it (e.g. after navigation)
  useEffect(() => {
    let listening = false;
    function onBlur() {
      if (listening) return;
      listening = true;
      function onMouseMove() {
        window.focus();
        listening = false;
        document.removeEventListener('mousemove', onMouseMove);
      }
      document.addEventListener('mousemove', onMouseMove);
    }
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('blur', onBlur); };
  }, [draftPin]);

  /* ── Update secondary point on existing thread ─────────────── */
  const handleSecondaryDragEnd = useCallback(async (thread: Thread, sx: number, sy: number) => {
    if (!project) return;
    const newAnchor = JSON.stringify({
      type: 'area',
      secondaryX: Math.round(sx * 1e4) / 1e4,
      secondaryY: Math.round(sy * 1e4) / 1e4,
    });
    try {
      await threadsApi.update(project.id, thread.id, { anchorData: newAnchor });
      loadThreads();
    } catch (err) {
      console.error('Failed to update secondary point:', err);
    }
  }, [project, loadThreads]);

  /* ── Create thread ──────────────────────────────────────────── */
  const handleCreateThread = useCallback(async (message: string, pinX: number, pinY: number, files?: StagedFile[], mentionIds?: string[], secondary?: { x: number; y: number }) => {
    if (!project) return;

    if (isAnonymous && allowAnonymousComments && !guestEmail.trim()) {
      showToast('Please enter your email first');
      return;
    }

    // Use ref to get the absolute latest page URL (avoids stale closure)
    const pageUrl = currentPageUrlRef.current;
    if (!pageUrl) {
      showToast('Waiting for page to load…');
      return;
    }

    const env = getEnvironment(viewport);
    const threadData: Record<string, unknown> = {
      title: message.slice(0, 60),
      message,
      pageUrl,
      pageTitle: project.name,
      contextType: 'pin',
      viewport,
      xPct: Math.round(pinX * 1e4) / 1e4,
      yPct: Math.round(pinY * 1e4) / 1e4,
      createdVia: 'workspace',
      environment: {
        browserName: env.browserName,
        browserVersion: env.browserVersion,
        osName: env.osName,
        osVersion: env.osVersion,
        viewportMode: env.viewportMode,
        viewportWidth: env.viewportWidth,
        viewportHeight: env.viewportHeight,
        devicePixelRatio: env.devicePixelRatio,
        userAgent: env.userAgent,
      },
    };

    // Area anchor data — secondary point (X) stored alongside thread
    if (secondary) {
      threadData.anchorData = JSON.stringify({
        type: 'area',
        secondaryX: Math.round(secondary.x * 1e4) / 1e4,
        secondaryY: Math.round(secondary.y * 1e4) / 1e4,
      });
    }

    // Add guest email for anonymous users
    if (isAnonymous && guestEmail.trim()) {
      threadData.guestEmail = guestEmail.trim().toLowerCase();
      localStorage.setItem('wpf-guest-email', guestEmail.trim().toLowerCase());
    }
    
    console.log('📝 Creating thread:', threadData);
    const created = await threadsApi.create(project.id, threadData);
    console.log('✅ Thread created:', created);
    setDraftPin(null);
    setPinMode(true);
    showToast('Thread created');
    
    // Optimistically add the new thread to the list so the pin appears immediately
    if (created) {
      const optimisticThread: Thread = {
        ...created,
        author: currentUser ? {
          id: currentUser.id,
          email: currentUser.email,
          displayName: currentUser.displayName,
          avatarUrl: currentUser.avatarUrl,
        } : null,
        guestEmail: isAnonymous ? guestEmail.trim().toLowerCase() : undefined,
        _count: { comments: 0 },
      };
      setThreadList((prev) => [optimisticThread, ...prev]);
      setStatusCnts((prev) => ({ ...prev, open: prev.open + 1 }));

      // Upload staged files as attachments (await all before refresh)
      if (files && files.length > 0) {
        for (const sf of files) {
          try {
            await attachmentsApi.uploadFile(sf.file, 'thread', created.id);
          } catch (err) {
            console.error('Failed to upload attachment:', err);
          }
        }
      }

      // Capture screenshot via bridge (runs inside iframe — no cross-origin issue)
      const iframe = iframeRef.current;
      if (iframe) {
        try {
          const blob = await captureScreenshot(iframe, threadData.xPct as number, threadData.yPct as number);
          if (blob) {
            const file = screenshotBlobToFile(blob, message.slice(0, 30));
            const uploaded = await attachmentsApi.uploadFile(file, 'thread', created.id);
            await threadsApi.update(project.id, created.id, { screenshotUrl: uploaded.url });
          }
        } catch (err) {
          console.warn('Screenshot capture failed (non-fatal):', err);
        }
      }
    }
    
    // Refresh after uploads complete to show attachments + screenshot
    loadThreads();
    // Ensure panel is in list view, not detail view
    setViewMode('list');
    setActiveThread(null);
    if (!panelOpen) setPanelOpen(true);
  }, [project, viewport, currentPageUrl, showToast, loadThreads, panelOpen, currentUser, isAnonymous, allowAnonymousComments, guestEmail, draftPin]);

  /* ── Toggle thread status ───────────────────────────────────── */
  const handleResolve = useCallback(async (thread: Thread) => {
    if (!project) return;
    if (isAnonymous) { showToast('Sign in to manage threads'); return; }
    const newStatus = thread.status === 'resolved' ? 'open' : 'resolved';
    try {
      await threadsApi.update(project.id, thread.id, { status: newStatus });
      showToast(newStatus === 'resolved' ? 'Thread resolved' : 'Thread reopened');
      // Close popover if it was for this thread
      if (popoverThread?.id === thread.id) { setPopoverThread(null); setPopoverPinRect(null); }
      if (activeThread?.id === thread.id) { setActiveThread(null); setViewMode('list'); }
      loadThreads();
    } catch { showToast('Failed to update status'); }
  }, [project, showToast, loadThreads, activeThread, popoverThread, isAnonymous]);

  /* ── Delete thread ──────────────────────────────────────────── */
  const handleDelete = useCallback((thread: Thread) => {
    if (isAnonymous) { showToast('Sign in to manage threads'); return; }
    setConfirm({
      message: 'Delete this thread and all its replies?',
      onConfirm: async () => {
        setConfirm(null);
        if (!project) return;
        try {
          await threadsApi.delete(project.id, thread.id);
          showToast('Thread deleted');
          if (popoverThread?.id === thread.id) { setPopoverThread(null); setPopoverPinRect(null); }
          if (activeThread?.id === thread.id) { setActiveThread(null); setViewMode('list'); }
          loadThreads();
        } catch { showToast('Failed to delete thread'); }
      },
    });
  }, [project, showToast, loadThreads, activeThread, popoverThread, isAnonymous]);

  /* ── Open thread detail ─────────────────────────────────────── */
  const openThreadDetail = useCallback(async (thread: Thread) => {
    if (!project) return;
    // Close popover when opening sidebar detail
    setPopoverThread(null);
    setPopoverPinRect(null);
    try {
      const full = await threadsApi.get(project.id, thread.id);
      setActiveThread(full);
      setViewMode('detail');
      if (!panelOpen) setPanelOpen(true);
    } catch { showToast('Failed to load thread'); }
  }, [project, showToast, panelOpen]);

  /* ── Pin drag ───────────────────────────────────────────────── */
  const handlePinDragEnd = useCallback(async (thread: Thread, xPct: number, yPct: number) => {
    if (!project) return;
    if (isAnonymous) return; // Anonymous users can't reposition pins
    // Update position optimistically for immediate feedback
    setThreadList((prev) => 
      prev.map((t) => 
        t.id === thread.id ? { ...t, xPct: Math.round(xPct * 1e4) / 1e4, yPct: Math.round(yPct * 1e4) / 1e4 } : t
      )
    );
    
    // Persist to backend
    try {
      await threadsApi.update(project.id, thread.id, {
        xPct: Math.round(xPct * 1e4) / 1e4,
        yPct: Math.round(yPct * 1e4) / 1e4,
      });
    } catch { 
      showToast('Failed to save pin position'); 
      // Revert position on error
      loadThreads(); 
    }

    // 2.1: Restore popover if thread was open before drag
    const savedThread = preDragPopoverThread.current;
    if (savedThread && savedThread.id === thread.id) {
      requestAnimationFrame(() => {
        const pinEl = document.querySelector(`[data-thread-id="${thread.id}"]`);
        if (pinEl) {
          setPopoverThread(thread);
          setPopoverPinRect(pinEl.getBoundingClientRect());
        }
      });
    }
    preDragPopoverThread.current = null;
  }, [project, showToast, loadThreads]);

  /* ── Pin drag start → hide popovers ──────────────────────────── */
  const handlePinDragStart = useCallback(() => {
    // 2.1: Save currently open popover thread before drag
    preDragPopoverThread.current = popoverThread;
    // 2.3: Hide preview and thread popovers during drag
    setHoveredThread(null);
    setHoveredPinRect(null);
    setPopoverThread(null);
    setPopoverPinRect(null);
  }, [popoverThread]);

  /* ── Pin hover → preview popover ───────────────────────────── */
  const handlePinHoverEnter = useCallback((thread: Thread) => {
    if (popoverThread) return; // full popover is open
    setHoveredThread(thread);
    // Get pin element rect for positioning
    const pinEl = document.querySelector(`[data-thread-id="${thread.id}"]`);
    if (pinEl) setHoveredPinRect(pinEl.getBoundingClientRect());
  }, [popoverThread]);

  const handlePinHoverLeave = useCallback((thread: Thread) => {
    setHoveredThread((prev) => (prev?.id === thread.id ? null : prev));
    setHoveredPinRect(null);
  }, []);

  /* ── Pin click → full thread popover ───────────────────────── */
  const handlePinClick = useCallback((thread: Thread) => {
    // Toggle: close if already open for this thread
    if (popoverThread?.id === thread.id) {
      setPopoverThread(null);
      setPopoverPinRect(null);
      return;
    }
    setHoveredThread(null);
    const pinEl = document.querySelector(`[data-thread-id="${thread.id}"]`);
    const rect = pinEl ? pinEl.getBoundingClientRect() : new DOMRect();
    setPopoverThread(thread);
    setPopoverPinRect(rect);
  }, [popoverThread]);

  /* ── Scroll-to-pin (from sidebar list click) ────────────────── */
  // 4.1: Always open popover at pin, never inline in sidebar
  const handleThreadClick = useCallback(async (thread: Thread) => {
    if (!project) return;
    if (thread.contextType === 'pin' && thread.xPct != null) {
      const pinEl = document.querySelector(`[data-thread-id="${thread.id}"]`);
      if (pinEl) {
        pinEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Open popover next to pin (no resize/animation on pin — 2.2)
        const rect = pinEl.getBoundingClientRect();
        setPopoverThread(thread);
        setPopoverPinRect(rect);
        return;
      }
    }
    // Non-pin threads: open popover-style detail (fallback)
    openThreadDetail(thread);
  }, [project, openThreadDetail]);

  /* ── Viewport change ────────────────────────────────────────── */
  const handleViewportChange = useCallback((vp: Viewport) => {
    setViewport(vp);
    localStorage.setItem('wpf-viewport', vp);
    setScopeFilter('this_page');
    setDraftPin(null);
    setPopoverThread(null);
    setPopoverPinRect(null);
  }, []);

  /* ── Loading / error states ─────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-gray-400">Loading workspace…</div>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-gray-400">Project not found.</div>
      </div>
    );
  }

  const effectivePanelOpen = panelOpen && !panelHidden;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-900">
      {/* ══════ Toolbar ══════ */}
      <Toolbar
        projectName={project.name}
        projectSlug={project.slug}
        viewport={viewport}
        scopeFilter={scopeFilter}
        statusFilter={statusFilter}
        statusCounts={statusCnts}
        pinMode={pinMode}
        panelOpen={panelOpen}
        onViewportChange={handleViewportChange}
        onScopeChange={setScopeFilter}
        onStatusChange={setStatusFilter}
        onPinModeToggle={() => { setPinMode((v) => !v); if (pinMode) setDraftPin(null); }}
        onPanelToggle={() => setPanelOpen((v) => !v)}
      />

      {/* ══════ Anonymous guest email bar ══════ */}
      {isAnonymous && allowAnonymousComments && (
        <div className="flex items-center gap-2 border-b border-gray-700 bg-gray-800 px-4 py-1.5">
          <span className="text-xs text-gray-400 shrink-0">Your email:</span>
          <input
            type="email"
            value={guestEmail}
            onChange={(e) => {
              setGuestEmail(e.target.value);
              localStorage.setItem('wpf-guest-email', e.target.value);
            }}
            placeholder="you@example.com"
            className="w-48 rounded border border-gray-600 bg-gray-700 px-2 py-0.5 text-xs text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <span className="text-[10px] text-gray-500">Required to create threads &amp; comments</span>
        </div>
      )}
      {isAnonymous && !allowAnonymousComments && (
        <div className="flex items-center gap-2 border-b border-gray-700 bg-gray-800 px-4 py-1.5">
          <span className="text-xs text-gray-400">Viewing as guest — commenting is disabled</span>
        </div>
      )}

      {/* ══════ Main content ══════ */}
      <div className="relative flex-1 overflow-hidden">
        {/* Iframe */}
        <IframeViewer
          ref={iframeRef}
          src={project.baseUrl}
          projectName={project.name}
          viewport={viewport}
          panelOpen={effectivePanelOpen}
        />

        {/* Pin overlay */}
        <PinOverlay
          threads={threadList}
          activeThreadId={activeThread?.id ?? null}
          hoveredThreadId={hoveredThread?.id ?? null}
          draftPin={draftPin}
          pinMode={pinMode}
          panelHidden={panelHidden}
          setOverlayElement={bridge.setOverlayElement}
          docHeight={bridge.docHeight}
          scrollIframeBy={bridge.scrollIframeBy}
          bridgeActiveRef={bridge.bridgeActiveRef}
          currentPageUrl={currentPageUrl}
          viewport={viewport}
          projectId={project.id}
          onOverlayClick={(pinX, pinY) => {
            if (isAnonymous && !allowAnonymousComments) {
              showToast('Commenting is not enabled for guests');
              return;
            }
            if (popoverThread) { setPopoverThread(null); setPopoverPinRect(null); }
            if (activeThread) { setActiveThread(null); setViewMode('list'); }
            setDraftPin({ pinX, pinY });
          }}
          onAreaSelect={(secondaryX, secondaryY, pinX, pinY) => {
            if (isAnonymous && !allowAnonymousComments) {
              showToast('Commenting is not enabled for guests');
              return;
            }
            if (popoverThread) { setPopoverThread(null); setPopoverPinRect(null); }
            if (activeThread) { setActiveThread(null); setViewMode('list'); }
            setDraftPin({ pinX, pinY, secondary: { x: secondaryX, y: secondaryY } });
          }}
          onPinHoverEnter={handlePinHoverEnter}
          onPinHoverLeave={handlePinHoverLeave}
          onPinClick={handlePinClick}
          onPinDragEnd={handlePinDragEnd}
          onPinDragStart={handlePinDragStart}
          onPanelHide={() => setPanelHidden(true)}
          onPanelRestore={() => setPanelHidden(false)}
          onDraftSubmit={handleCreateThread}
          onDraftCancel={() => setDraftPin(null)}
          onSecondaryDragEnd={handleSecondaryDragEnd}
        />

        {/* Interact mode banner */}
        {!pinMode && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-blue-600/90 px-4 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-sm flex items-center gap-1.5">
            <IconMousePointerClick />
            Interact mode — click through to the page.{' '}
            <kbd className="mx-0.5 rounded bg-white/20 px-1">I</kbd> or{' '}
            <kbd className="mx-0.5 rounded bg-white/20 px-1">Esc</kbd> to return to pin mode
          </div>
        )}

        {/* Side panel */}
        <SidePanel
          open={effectivePanelOpen}
          threads={threadList}
          activeThreadId={popoverThread?.id ?? null}
          viewport={viewport}
          scopeFilter={scopeFilter}
          statusFilter={statusFilter}
          statusCounts={statusCnts}
          hoveredPinId={hoveredThread?.id ?? null}
          onClose={() => setPanelOpen(false)}
          onThreadClick={handleThreadClick}
          onThreadHoverEnter={(t) => {
            setHoveredThread(t);
            const pinEl = document.querySelector(`[data-thread-id="${t.id}"]`);
            if (pinEl) setHoveredPinRect(pinEl.getBoundingClientRect());
          }}
          onThreadHoverLeave={(t) => {
            setHoveredThread((prev) => (prev?.id === t.id ? null : prev));
          }}
          onResolve={handleResolve}
          onDelete={handleDelete}
          onShowEnv={(env, rect) => setEnvData({ env, rect })}
          showToast={showToast}
        />
      </div>

      {/* ══════ Preview popover (hover) ══════ */}
      {hoveredThread && hoveredPinRect && !popoverThread && (
        <PreviewPopover
          thread={hoveredThread}
          pinRect={hoveredPinRect}
          panelOpen={effectivePanelOpen}
        />
      )}

      {/* ══════ Full thread popover (click) ══════ */}
      {popoverThread && popoverPinRect && (
        <ThreadPopover
          thread={popoverThread}
          projectId={project.id}
          pinRect={popoverPinRect}
          panelOpen={effectivePanelOpen}
          currentUser={currentUser}
          userRole={userRole}
          isAnonymous={isAnonymous}
          guestEmail={guestEmail}
          onClose={() => { setPopoverThread(null); setPopoverPinRect(null); }}
          onResolve={handleResolve}
          onDelete={handleDelete}
          onRefresh={loadThreads}
          onShowEnv={(env, rect) => setEnvData({ env, rect })}
          showToast={showToast}
        />
      )}

      {/* ══════ Environment popover ══════ */}
      {envData && (
        <EnvironmentPopover
          env={envData.env}
          anchorRect={envData.rect}
          onClose={() => setEnvData(null)}
        />
      )}

      {/* ══════ Confirm dialog ══════ */}
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* ══════ Toast ══════ */}
      <Toast message={toast} />
    </div>
  );
}
