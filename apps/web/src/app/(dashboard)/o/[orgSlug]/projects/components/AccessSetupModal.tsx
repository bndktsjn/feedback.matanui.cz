'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { projects } from '@/lib/api';

interface AccessSetupModalProps {
  projectName: string;
  projectBaseUrl: string;
  projectSlug: string;
  projectId: string;
  orgId: string;
  onClose: () => void;
}

type ModalPhase = 'detecting' | 'setup' | 'testing' | 'success' | 'error';

export default function AccessSetupModal({
  projectName,
  projectBaseUrl,
  projectSlug,
  projectId,
  orgId,
  onClose,
}: AccessSetupModalProps) {
  const [phase, setPhase] = useState<ModalPhase>('detecting');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const listenerRef = useRef<((e: MessageEvent) => void) | null>(null);

  // Open workspace in new tab
  const openWorkspace = useCallback(() => {
    window.open(`/p/${projectSlug}/workspace`, '_blank', 'noopener');
  }, [projectSlug]);

  // Fetch API key for embed code
  useEffect(() => {
    projects
      .get(orgId, projectId)
      .then((detail: unknown) => {
        const d = detail as { settings?: { apiKey?: string } };
        setApiKey(d?.settings?.apiKey || null);
      })
      .catch(() => {});
  }, [orgId, projectId]);

  // Embed code
  const embedCode = apiKey
    ? `<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/static/overlay.js" data-key="${apiKey}"></script>`
    : '';

  // Clean up message listener
  function clearListener() {
    if (listenerRef.current) {
      window.removeEventListener('message', listenerRef.current);
      listenerRef.current = null;
    }
    clearTimeout(timeoutRef.current);
  }

  // Detect bridge: returns Promise<boolean>
  const detectBridge = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      clearListener();

      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'FB_READY') {
          clearListener();
          resolve(true);
        }
      };
      listenerRef.current = handler;
      window.addEventListener('message', handler);

      // Send FB_INIT with retries (iframe may not be ready yet)
      const sendInit = () => {
        try {
          iframeRef.current?.contentWindow?.postMessage({ type: 'FB_INIT' }, '*');
        } catch { /* ignore postMessage errors */ }
      };
      setTimeout(sendInit, 300);
      setTimeout(sendInit, 1000);
      setTimeout(sendInit, 1800);

      // Timeout after 2.5s
      timeoutRef.current = setTimeout(() => {
        clearListener();
        resolve(false);
      }, 2500);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial detection on mount
  useEffect(() => {
    // Fast path: localStorage says bridge works for this project
    const key = `fb_bridge_ok_${projectSlug}`;
    if (typeof window !== 'undefined' && localStorage.getItem(key) === '1') {
      openWorkspace();
      onClose();
      return;
    }

    const iframe = iframeRef.current;
    if (!iframe) return;

    let cancelled = false;

    function onLoad() {
      if (cancelled) return;
      detectBridge().then((ok) => {
        if (cancelled) return;
        if (ok) {
          localStorage.setItem(key, '1');
          setPhase('success');
          setTimeout(() => {
            openWorkspace();
            onClose();
          }, 600);
        } else {
          setPhase('setup');
        }
      });
    }

    iframe.addEventListener('load', onLoad);

    return () => {
      cancelled = true;
      iframe.removeEventListener('load', onLoad);
      clearListener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Test button
  const handleTest = useCallback(() => {
    setPhase('testing');
    const iframe = iframeRef.current;
    if (!iframe) return;
    const iframeEl = iframe; // capture for closure

    // Force reload
    iframeEl.src = projectBaseUrl + (projectBaseUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();

    let cancelled = false;
    function onLoad() {
      iframeEl.removeEventListener('load', onLoad);
      if (cancelled) return;
      detectBridge().then((ok) => {
        if (cancelled) return;
        if (ok) {
          localStorage.setItem(`fb_bridge_ok_${projectSlug}`, '1');
          setPhase('success');
          setTimeout(() => {
            openWorkspace();
            onClose();
          }, 600);
        } else {
          setPhase('error');
          setTimeout(() => setPhase('setup'), 2500);
        }
      });
    }
    iframeEl.addEventListener('load', onLoad);

    return () => {
      cancelled = true;
      iframeEl.removeEventListener('load', onLoad);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectBaseUrl, projectSlug, detectBridge, openWorkspace, onClose]);

  // Copy embed code
  const handleCopy = useCallback(() => {
    if (!embedCode) return;
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [embedCode]);

  const showSetup = phase === 'setup' || phase === 'error';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Hidden iframe for detection */}
      <iframe
        ref={iframeRef}
        src={projectBaseUrl}
        className="absolute opacity-0 pointer-events-none"
        style={{ width: 1, height: 1 }}
        sandbox="allow-same-origin allow-scripts"
        title="Bridge detection"
      />

      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl mx-4 overflow-hidden">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-lg p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="border-b border-gray-100 px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
              <svg
                className="h-5 w-5 text-blue-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900">Setup for {projectName}</h2>
              <p className="text-sm text-gray-500 truncate">{projectBaseUrl}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          {/* ── DETECTING ── */}
          {phase === 'detecting' && (
            <div className="flex flex-col items-center py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-blue-200 border-t-blue-600" />
              <p className="mt-4 text-sm text-gray-600">Checking for feedback script&hellip;</p>
              <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{
                    width: '100%',
                    animation: 'fb-progress 2.5s ease-in-out forwards',
                  }}
                />
              </div>
              <style>{`@keyframes fb-progress { from { width: 0% } to { width: 100% } }`}</style>
            </div>
          )}

          {/* ── SUCCESS ── */}
          {phase === 'success' && (
            <div className="flex flex-col items-center py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <p className="mt-3 text-sm font-medium text-green-700">Script detected! Opening workspace&hellip;</p>
            </div>
          )}

          {/* ── TESTING ── */}
          {phase === 'testing' && (
            <div className="flex flex-col items-center py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-blue-200 border-t-blue-600" />
              <p className="mt-4 text-sm text-gray-600">Testing connection&hellip;</p>
            </div>
          )}

          {/* ── ERROR (brief flash, then back to setup) ── */}
          {phase === 'error' && (
            <div className="mb-4 flex items-center gap-3 rounded-lg bg-red-50 border border-red-200 p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100">
                <svg className="h-4 w-4 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-red-700">Script not detected yet</p>
                <p className="text-xs text-red-600/70">Make sure you&apos;ve added the script and deployed.</p>
              </div>
            </div>
          )}

          {/* ── SETUP (shown for both 'setup' and 'error' phases) ── */}
          {showSetup && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-700">
                Do you have access to manage this website&apos;s code?
              </p>

              {/* ── YES PATH ── */}
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold mt-0.5">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900">Yes &mdash; I can add a script tag</h3>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Full support: all viewports + smooth scroll + page navigation
                    </p>

                    {embedCode ? (
                      <div className="mt-3">
                        <p className="text-xs text-gray-500 mb-1.5">
                          Add this before{' '}
                          <code className="text-[11px] bg-gray-200/80 px-1 py-0.5 rounded">&lt;/body&gt;</code>
                          {' '}on your site:
                        </p>
                        <pre className="rounded-lg bg-gray-900 p-3 text-[11px] leading-relaxed text-green-400 overflow-x-auto whitespace-pre-wrap break-all select-all">
                          {embedCode}
                        </pre>
                        <div className="mt-2.5 flex gap-2">
                          <button
                            onClick={handleCopy}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition"
                          >
                            {copied ? (
                              <>
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                                Copied!
                              </>
                            ) : (
                              <>
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                Copy snippet
                              </>
                            )}
                          </button>
                          <button
                            onClick={handleTest}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>
                            Test connection
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
                        Loading embed code&hellip;
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── NO PATH ── */}
              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-400 text-white text-xs font-bold mt-0.5">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-gray-900">No &mdash; I don&apos;t have code access</h3>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Use a browser extension (desktop feedback only)
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href="https://chrome.google.com/webstore"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white hover:shadow-sm transition"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M21.17 8H12" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M3.95 6.06L8.54 14" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M10.88 21.94L15.46 14" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                        Chrome
                      </a>
                      <a
                        href="https://addons.mozilla.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white hover:shadow-sm transition"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M8 12a4 4 0 1 0 8 0" />
                        </svg>
                        Firefox
                      </a>
                      <button
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white hover:shadow-sm transition"
                        title="QR code to Chrome Web Store (coming soon)"
                        onClick={() => {
                          /* TODO: show QR modal */
                        }}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="3" y="3" width="7" height="7" rx="1" />
                          <rect x="14" y="3" width="7" height="7" rx="1" />
                          <rect x="3" y="14" width="7" height="7" rx="1" />
                          <rect x="14" y="14" width="3" height="3" />
                          <rect x="18" y="18" width="3" height="3" />
                          <rect x="14" y="18" width="3" height="3" />
                          <rect x="18" y="14" width="3" height="3" />
                        </svg>
                        QR Code
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {showSetup && (
          <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between">
            <button
              onClick={() => {
                openWorkspace();
                onClose();
              }}
              className="text-xs text-gray-400 hover:text-gray-600 transition"
            >
              Open workspace anyway &rarr;
            </button>
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
