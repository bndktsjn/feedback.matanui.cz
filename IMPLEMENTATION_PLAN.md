# Implementation Plan — WP Plugin Parity

**Companion to**: `AUDIT_REPORT.md`
**Goal**: Pixel-perfect feature parity between WP plugin and SaaS workspace

---

## Architecture Decisions

1. **Component decomposition** — Break the monolithic 842-line `page.tsx` into focused components
2. **State management** — Keep React useState for now; migrate to Zustand if state gets unwieldy
3. **Styling** — Continue Tailwind CSS; add CSS modules only for complex animations
4. **iframe bridge** — Implement postMessage protocol matching WP plugin's `WPF_` prefix scheme
5. **Composer** — Upgrade from `<textarea>` to ContentEditable `<div>` for mentions + rich features

---

## Component Breakdown

```
workspace/
├── page.tsx                    # Layout shell, routing, project loading
├── components/
│   ├── Toolbar.tsx             # Top toolbar (viewport, scope, status, pin mode, panel toggle)
│   ├── IframeViewer.tsx        # Desktop iframe + device chrome wrapper
│   ├── PinOverlay.tsx          # Pin layer (pointer-events management, click handling)
│   ├── PinMarker.tsx           # Single pin marker (teardrop, resolved badge, drag, hover)
│   ├── DraftPin.tsx            # Draft pin + composer (draggable, edge flip)
│   ├── Popover.tsx             # Thread popover (preview on hover, full on click)
│   ├── SidePanel.tsx           # Slide-in panel shell
│   ├── ThreadList.tsx          # Thread list view (grouped + flat)
│   ├── ThreadListItem.tsx      # Single list item (author, preview, actions, resolve)
│   ├── ThreadDetail.tsx        # Detail view (message, screenshot, replies, reply form)
│   ├── Composer.tsx            # Rich composer (ContentEditable, send btn, actions row)
│   ├── MentionPopup.tsx        # @mention autocomplete popup
│   ├── AttachmentManager.tsx   # File upload, progress, staged chips
│   ├── ScreenshotViewer.tsx    # Thumbnail + lightbox + edit launcher
│   ├── EnvironmentPopover.tsx  # Environment info display
│   ├── MoreMenu.tsx            # Portal menu (Copy link, Environment, Delete)
│   ├── ConfirmDialog.tsx       # Custom confirm modal
│   ├── Toast.tsx               # Toast notification
│   └── InspectPill.tsx         # Bottom-left interact mode indicator
├── hooks/
│   ├── useIframeBridge.ts      # postMessage send/receive, scroll sync, navigation
│   ├── useThreads.ts           # Thread list loading, caching, filtering
│   ├── useKeyboardShortcuts.ts # I toggle, Escape cascade
│   ├── usePinDrag.ts           # Pointer-event based drag for pins
│   ├── useDeepLink.ts          # URL parsing, state restore, history sync
│   └── useScreenshot.ts        # html2canvas capture, upload, attach
├── lib/
│   ├── environment.ts          # Browser/OS/viewport detection
│   └── bridge-protocol.ts      # Message type constants, helpers
└── types.ts                    # Shared TypeScript interfaces
```

---

## Task Breakdown

### Phase 1 — Foundation (Estimated: 3-4 sessions)

#### Task 1.1: Component Decomposition
**Priority**: Critical
**AC**:
- [ ] Extract `Toolbar`, `SidePanel`, `ThreadList`, `ThreadDetail`, `PinOverlay`, `PinMarker`, `DraftPin`, `Toast` into separate files
- [ ] Wire up with same functionality as current monolith
- [ ] No visual or behavioral regressions

#### Task 1.2: Popover System
**Priority**: Critical
**AC**:
- [ ] Preview popover appears on pin hover (author, message preview, reply count)
- [ ] Full thread popover opens on pin click (header, message, replies, reply form)
- [ ] Smart positioning: right of pin, flips left when near right edge
- [ ] Close on Escape, close on outside click
- [ ] Cached thread data for instant open + background refresh
- [ ] Popover renders in portal (body-appended, never clipped)

#### Task 1.3: Pin Drag & Drop
**Priority**: Critical
**AC**:
- [ ] Existing pins are draggable via pointer events
- [ ] New position saved to API via PATCH on drop
- [ ] Panel auto-hides during drag, restores after
- [ ] Popover closes during drag, optionally restores after
- [ ] `wpf-pin--dragging` visual state during drag
- [ ] Draft pin also draggable before submit

#### Task 1.4: Scroll-to-Pin
**Priority**: Critical
**AC**:
- [ ] Clicking thread in list scrolls iframe to pin location
- [ ] Pin highlight animation (scale pulse + color flash, 600ms)
- [ ] Opens popover after scroll
- [ ] Device mode: commands iframe to `scrollTo` via bridge

#### Task 1.5: Rich Composer
**Priority**: Critical
**AC**:
- [ ] ContentEditable `<div>` replaces `<textarea>`
- [ ] Placeholder text via CSS `:empty:before`
- [ ] Paste strips HTML (plain text only)
- [ ] Enter inserts `<br>`, no `<div>` wrapping
- [ ] Circular send button inside input wrap
- [ ] Actions row (@ mention button, attachment button) — initially non-functional
- [ ] `.value` getter returns plain text (strips HTML)
- [ ] Disabled state when no content
- [ ] Used in: pin composer, reply form in popover, reply form in detail view

---

### Phase 2 — Major Features (Estimated: 4-5 sessions)

#### Task 2.1: iframe Bridge Protocol
**Priority**: High
**AC**:
- [ ] `useIframeBridge` hook manages postMessage communication
- [ ] Bridge child script injected or loaded in iframe pages
- [ ] Messages: READY (dimensions, URL, title), SCROLL, RESIZE, NAVIGATED, KEY_DOWN, ACK
- [ ] Parent tracks: `iframeDocWidth/Height`, `iframeScrollX/Y`, `iframeVpWidth/Height`, `iframePageUrl`, `iframePageTitle`
- [ ] Device overlay scroll sync (`translateY(-scrollY)`)
- [ ] Keyboard forwarding (I, Escape) from iframe to parent
- [ ] SPA navigation detection (pushState/replaceState hooks, popstate, hashchange, fallback poll)
- [ ] Device auto-scale (`scaleDeviceFrame`)

#### Task 2.2: @Mention Autocomplete
**Priority**: High
**AC**:
- [ ] Typing `@` in ContentEditable triggers autocomplete popup
- [ ] Popup fetches project members via API search
- [ ] Keyboard navigation: ArrowUp/Down to navigate, Enter/Tab to select, Escape to close
- [ ] Selecting user inserts non-editable `<span class="mention">@Name</span>` + trailing space
- [ ] Mention IDs tracked and sent with create/reply API calls
- [ ] `renderContent` function highlights @mentions in displayed messages
- [ ] Popup positioned below composer, flips above if near bottom

#### Task 2.3: Attachment System
**Priority**: High
**Backend**:
- [ ] Add file upload endpoint: `POST /projects/:id/attachments` (multipart)
- [ ] Store in local filesystem or S3 (configurable)
- [ ] Return `{ id, url, filename, mime, size }`
- [ ] Add `attachmentIds` field to thread create + comment create DTOs

**Frontend**:
- [ ] `AttachmentManager` component with staged upload queue
- [ ] File input + drag-drop on composer
- [ ] Upload progress bar per file
- [ ] Staged file chips with remove button
- [ ] `renderAttachments` displays chips (image thumbnail for images, filename for others)
- [ ] Attachments shown in popover, detail view, and per-reply

#### Task 2.4: Screenshot System
**Priority**: High
**AC**:
- [ ] Desktop capture: `html2canvas` of viewport (hiding overlay UI during capture)
- [ ] Device capture: postMessage `CAPTURE_SCREENSHOT` → iframe runs html2canvas → returns data URL
- [ ] Auto-capture after thread creation (async, non-blocking)
- [ ] Status chip ("Capturing…", "Uploading…", "Attaching…", "✓ Screenshot") near pin
- [ ] Screenshot thumbnail in popover + detail view
- [ ] Lightbox view on click (full-screen overlay)
- [ ] Screenshot remove button (PATCH `screenshotUrl: null`)
- [ ] Screenshot editor integration (stretch goal — can use external library)

#### Task 2.5: Environment Capture
**Priority**: High
**AC**:
- [ ] `getEnvironment()` function detects browser name/version, OS name/version, viewport mode, dimensions, user agent
- [ ] Sent as `environment` object in thread create payload
- [ ] Environment popover accessible from more menu (shows icon + label + value rows)
- [ ] API already supports `environment` field on thread create

---

### Phase 3 — Polish & Advanced (Estimated: 3-4 sessions)

#### Task 3.1: Deep Linking
**Priority**: Medium
**AC**:
- [ ] URL scheme: `?thread=ID&viewport=VP` (adapted for SaaS routing)
- [ ] On page load, parse URL params → open thread → scroll to pin
- [ ] `history.replaceState` on thread open/close to keep URL in sync
- [ ] Cross-page navigation: save panel state to sessionStorage, restore on target page

#### Task 3.2: More Menu / Portal Menu
**Priority**: Medium
**AC**:
- [ ] `MoreMenu` component renders body-appended fixed-position menu
- [ ] Items: Copy link, Environment info, Delete thread
- [ ] Available on: thread list items, detail view, popover header
- [ ] Positioning: below trigger, flips above if near bottom
- [ ] Closes on outside click

#### Task 3.3: Reply Edit & Delete
**Priority**: Medium
**AC**:
- [ ] Edit button on own replies → inline textarea replaces content
- [ ] Save/Cancel buttons, PATCH API call
- [ ] Delete button on own replies → confirm → DELETE API call
- [ ] Admin can edit/delete any reply

#### Task 3.4: Custom Confirm Dialog
**Priority**: Medium
**AC**:
- [ ] Modal overlay with message, Cancel button, action button
- [ ] Replaces `window.confirm()` for delete thread, delete reply, remove screenshot
- [ ] Escape to close, click-outside to close

#### Task 3.5: UI Polish Pass
**Priority**: Medium
**AC**:
- [ ] Real avatar images (from `avatarUrl`) instead of letter initials
- [ ] Resolved pin badge (green check circle on marker)
- [ ] Pin highlight animation on scroll-to (scale pulse, 600ms)
- [ ] Pin ↔ list hover correlation (highlight pin when hovering list item)
- [ ] Outside-click shake guard for composer (shake on first click if ≥4 chars)
- [ ] Composer flip to left side when pin is near right edge
- [ ] Spinner animation component (replaces text "Loading…")
- [ ] Inspect/pin mode indicator pill (bottom-left, shows cursor icon + kbd hint)
- [ ] URL auto-linkify in composer (on space, wrap URL in `<a>`)

#### Task 3.6: Keyboard Shortcuts Polish
**Priority**: Low
**AC**:
- [ ] Full Escape cascade: pin mode → mention popup → portal menu → composer → popover → panel close
- [ ] I/Escape forwarded from iframe via bridge
- [ ] `isEditable` check prevents I toggle when typing in inputs

---

## Dependency Graph

```
Task 1.1 (Decompose) ──┬── Task 1.2 (Popover)
                        ├── Task 1.3 (Pin Drag)
                        ├── Task 1.4 (Scroll-to-Pin)
                        └── Task 1.5 (Rich Composer) ──┬── Task 2.2 (Mentions)
                                                       └── Task 2.3 (Attachments)

Task 1.2 (Popover) + Task 1.5 (Composer) ──── Task 2.4 (Screenshots)

Task 2.1 (Bridge) ──── Task 2.4 (Screenshots, device mode)
                  ──── Task 1.4 (Scroll-to-Pin, device mode)
                  ──── Task 1.3 (Pin Drag, device mode)

Task 3.2 (More Menu) ──── Task 2.5 (Environment popover)
                      ──── Task 3.1 (Deep Link / Copy Link)
```

---

## Priority Order (Recommended Execution)

1. **Task 1.1** — Component decomposition (unblocks everything)
2. **Task 1.5** — Rich composer (unblocks mentions, attachments)
3. **Task 1.2** — Popover system (core UX improvement)
4. **Task 1.3** — Pin drag & drop
5. **Task 1.4** — Scroll-to-pin
6. **Task 2.1** — iframe bridge protocol
7. **Task 2.2** — @mention autocomplete
8. **Task 2.3** — Attachment system (needs backend)
9. **Task 2.5** — Environment capture
10. **Task 2.4** — Screenshot system
11. **Task 3.2** — More menu
12. **Task 3.3** — Reply edit/delete
13. **Task 3.4** — Custom confirm dialog
14. **Task 3.1** — Deep linking
15. **Task 3.5** — UI polish pass
16. **Task 3.6** — Keyboard shortcuts polish

---

## Risk Factors

| Risk | Mitigation |
|------|------------|
| ContentEditable complexity (browser inconsistencies) | Use `document.execCommand` for basic operations; test in Chrome/Firefox/Safari |
| html2canvas cross-origin limitations | Same-origin iframe only; document limitation for external sites |
| File upload backend complexity | Start with local filesystem; add S3 later |
| iframe bridge reliability | Fallback polling for URL changes; timeout handling for screenshot capture |
| Large component tree re-renders | Memoize with `React.memo` and `useCallback`; profile if slow |

---

*End of Implementation Plan. Ready to begin Task 1.1 on approval.*
