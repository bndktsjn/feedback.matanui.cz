import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { Thread, Viewport, ScopeFilter, StatusFilter, StatusCounts, DraftPin } from './types';
import { api, flushQueue } from './api';
import { canonicalUrl, getViewport, getEnvironment } from './utils';
import Toolbar from './components/Toolbar';
import SidePanel from './components/SidePanel';
import PinOverlay from './components/PinOverlay';
import Toast from './components/Toast';

interface AppProps {
  root: ShadowRoot;
}

export default function App({ root }: AppProps) {
  // ── Core state ──
  const [threads, setThreads] = useState<Thread[]>([]);
  const [viewport, setViewport] = useState<Viewport>(getViewport());
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('this_page');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({ open: 0, resolved: 0 });
  const [panelOpen, setPanelOpen] = useState(false);
  const [pinMode, setPinMode] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [draftPin, setDraftPin] = useState<DraftPin | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [currentPageUrl, setCurrentPageUrl] = useState(canonicalUrl(location.href));
  const [loading, setLoading] = useState(true);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2500);
  }

  // ── Computed ──
  const activeThread = threads.find((t) => t.id === activeThreadId) || null;

  const filteredThreads = threads.filter((t) => {
    if (t.status !== statusFilter) return false;
    if (scopeFilter === 'this_page') {
      return canonicalUrl(t.pageUrl || '') === currentPageUrl;
    }
    return true;
  });

  // ── Data loading ──
  const loadThreads = useCallback(async () => {
    try {
      const all = await api.getThreads({ viewport });
      setThreads(all);
      setStatusCounts({
        open: all.filter((t) => t.status === 'open').length,
        resolved: all.filter((t) => t.status === 'resolved').length,
      });
    } catch (err) {
      console.error('[FB Agent] Failed to load threads:', err);
    } finally {
      setLoading(false);
    }
  }, [viewport]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Poll every 30s
  useEffect(() => {
    const id = setInterval(loadThreads, 30000);
    return () => clearInterval(id);
  }, [loadThreads]);

  // ── SPA navigation detection ──
  useEffect(() => {
    let lastUrl = canonicalUrl(location.href);
    const check = () => {
      const cur = canonicalUrl(location.href);
      if (cur !== lastUrl) {
        lastUrl = cur;
        setCurrentPageUrl(cur);
        setActiveThreadId(null);
        setDraftPin(null);
      }
    };
    const id = setInterval(check, 500);
    window.addEventListener('popstate', check);
    return () => { clearInterval(id); window.removeEventListener('popstate', check); };
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ctrl+Shift+F → toggle panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setPanelOpen((v) => !v);
        return;
      }
      // I → toggle interact mode
      if (e.key === 'i' || e.key === 'I') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
        setPinMode((v) => !v);
        return;
      }
      // Escape → close things
      if (e.key === 'Escape') {
        if (draftPin) { setDraftPin(null); return; }
        if (activeThreadId) { setActiveThreadId(null); return; }
        if (panelOpen) { setPanelOpen(false); return; }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [draftPin, activeThreadId, panelOpen]);

  // ── Flush offline queue on load ──
  useEffect(() => {
    flushQueue().then((n) => {
      if (n > 0) { showToast(`Synced ${n} queued feedback`); loadThreads(); }
    });
  }, []);

  // ── Event handlers ──
  function handleThreadClick(thread: Thread) {
    setActiveThreadId(thread.id);
    setPanelOpen(true);
  }

  function handleThreadHoverEnter(thread: Thread) {
    setHoveredPinId(thread.id);
  }

  function handleThreadHoverLeave(_thread: Thread) {
    setHoveredPinId(null);
  }

  async function handleResolve(thread: Thread) {
    const newStatus = thread.status === 'resolved' ? 'open' : 'resolved';
    try {
      await api.updateThread(thread.id, { status: newStatus });
      showToast(newStatus === 'resolved' ? 'Thread resolved' : 'Thread reopened');
      loadThreads();
    } catch {
      showToast('Failed to update status');
    }
  }

  async function handleDelete(thread: Thread) {
    if (!confirm('Delete this thread? This cannot be undone.')) return;
    try {
      await api.updateThread(thread.id, { status: 'deleted' });
      showToast('Thread deleted');
      if (activeThreadId === thread.id) setActiveThreadId(null);
      loadThreads();
    } catch {
      showToast('Failed to delete');
    }
  }

  function handleBack() {
    setActiveThreadId(null);
  }

  function handlePinClick(thread: Thread) {
    setActiveThreadId(thread.id);
    setPanelOpen(true);
  }

  async function handlePinDragEnd(thread: Thread, xPct: number, yPct: number) {
    try {
      await api.updateThread(thread.id, { xPct, yPct });
      loadThreads();
    } catch {
      showToast('Failed to move pin');
    }
  }

  function handleOverlayClick(e: MouseEvent) {
    if (draftPin) return; // Already have a draft
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    setDraftPin({ pinX: xPct, pinY: yPct });
  }

  async function handleDraftSubmit(message: string) {
    if (!draftPin || !message.trim()) return;
    try {
      await api.createThread({
        message,
        contextType: 'pin',
        pageUrl: location.href,
        pageTitle: document.title,
        viewport,
        xPct: draftPin.pinX,
        yPct: draftPin.pinY,
        environment: getEnvironment(),
      });
      setDraftPin(null);
      showToast('Feedback submitted');
      loadThreads();
    } catch {
      showToast('Failed to submit feedback');
    }
  }

  function handleDraftCancel() {
    setDraftPin(null);
  }

  const overlayRect = typeof document !== 'undefined'
    ? (root.host?.getBoundingClientRect() || null)
    : null;

  return (
    <>
      <Toolbar
        viewport={viewport}
        scopeFilter={scopeFilter}
        statusFilter={statusFilter}
        statusCounts={statusCounts}
        pinMode={pinMode}
        panelOpen={panelOpen}
        onViewportChange={setViewport}
        onScopeChange={setScopeFilter}
        onStatusChange={setStatusFilter}
        onPinModeToggle={() => setPinMode((v) => !v)}
        onPanelToggle={() => setPanelOpen((v) => !v)}
      />

      <PinOverlay
        threads={threads}
        viewport={viewport}
        currentPageUrl={currentPageUrl}
        activeThreadId={activeThreadId}
        hoveredPinId={hoveredPinId}
        pinMode={pinMode}
        draftPin={draftPin}
        overlayRect={overlayRect}
        root={root}
        onPinClick={handlePinClick}
        onPinHoverEnter={handleThreadHoverEnter}
        onPinHoverLeave={handleThreadHoverLeave}
        onPinDragEnd={handlePinDragEnd}
        onPinDragStart={() => {}}
        onOverlayClick={handleOverlayClick}
        onDraftSubmit={handleDraftSubmit}
        onDraftCancel={handleDraftCancel}
      />

      <SidePanel
        open={panelOpen}
        threads={filteredThreads}
        activeThread={activeThread}
        activeThreadId={activeThreadId}
        viewport={viewport}
        scopeFilter={scopeFilter}
        statusFilter={statusFilter}
        statusCounts={statusCounts}
        hoveredPinId={hoveredPinId}
        root={root}
        onClose={() => setPanelOpen(false)}
        onThreadClick={handleThreadClick}
        onThreadHoverEnter={handleThreadHoverEnter}
        onThreadHoverLeave={handleThreadHoverLeave}
        onResolve={handleResolve}
        onDelete={handleDelete}
        onBack={handleBack}
        onRefresh={loadThreads}
        showToast={showToast}
      />

      <Toast message={toastMsg} />
    </>
  );
}
