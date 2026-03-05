# Workspace Feature — Complete Implementation Plan

## 1. Executive Summary

Add a **"Feedback" button** to each project card in the dashboard. Clicking it opens a new tab at `/p/:projectSlug/workspace` that loads the project's `base_url` in an iframe with a pixel-perfect replica of the WP plugin overlay UI on top. This replaces the simple `overlay.js` embed with a full-featured, session-authenticated workspace experience.

**Key principle:** The workspace IS the iframe + overlay. The overlay runs as React components in the Next.js app, communicating with the iframe via `postMessage` — identical to how the WP plugin's device-preview mode works today.

---

## 2. WP Plugin Feature Inventory (from `frontend.js` analysis)

After studying the full 2883-line `frontend.js` + 598-line `screenshot-editor.js`:

### 2.1 Core UI Components
| # | Component | WP Source | Priority |
|---|-----------|-----------|----------|
| 1 | **FAB button** — "Feedback" pill, toggles review mode | `buildUI()` L1760-1845 | P0 |
| 2 | **Side panel** — 320px right drawer, slide animation | `.wpf-panel` | P0 |
| 3 | **Pin overlay** — full-page transparent layer for click-to-pin | `buildOverlay()` L1847-1873 | P0 |
| 4 | **Pin markers** — positioned at x%/y% on overlay | `createPinMarker()` L2467-2501 | P0 |
| 5 | **Pin composer** — inline form next to pin, flips at edges | `showPinComposer()` L2775-2818 | P0 |
| 6 | **Popover (preview)** — hover on pin → author + message preview | `openPreviewPopover()` L2580-2597 | P0 |
| 7 | **Popover (full)** — click on pin → thread + replies + reply form | `openPopover()` L2599-2702 | P0 |
| 8 | **Thread list** — sidebar list with author, preview, reply count | `showListView()` L2190-2328 | P0 |
| 9 | **Thread detail** — sidebar detail with replies, reply form | `showDetailView()` L2334-2436 | P0 |
| 10 | **Filter bar** — viewport (D/T/M) + scope (this page/all) + status (open/resolved) | L2196-2241 | P0 |

### 2.2 Interactions
| # | Feature | WP Source | Priority |
|---|---------|-----------|----------|
| 11 | **Pin drag** — drag existing pins to reposition, PATCH x_pct/y_pct | `initPinDrag()` L2503-2556 | P1 |
| 12 | **Draft pin drag** — drag new pin before submitting | `makeDraftPinDraggable()` L800-862 | P1 |
| 13 | **Interact mode** — press I to toggle pointer-events passthrough | `toggleInteractMode()` L1894-1932 | P0 |
| 14 | **Escape cascade** — Esc: interact → mention → menu → composer → popover → exit | L1825-1833 | P0 |
| 15 | **Scroll-through** — overlay wheel events forward to page scroll | L1851-1870 | P0 |
| 16 | **Resolve/reopen toggle** — checkmark button on threads | `toggleThreadStatus()` L2116-2139 | P0 |
| 17 | **Delete thread/reply** — with confirm dialog | `deleteThread()` L2160-2183 | P1 |
| 18 | **Deep-linking** — URL params `?wpf=comment&thread=ID&viewport=VP` | `handleDeepLink()` L1152-1200 | P1 |
| 19 | **Cross-page navigation** — click thread on different page → iframe navigates | `navigateToThread()` L1140-1150 | P1 |
| 20 | **Panel state persistence** — sessionStorage across page navigations | `savePanelState()` L1119-1138 | P2 |

### 2.3 Device Preview (iframe bridge)
| # | Feature | WP Source | Priority |
|---|---------|-----------|----------|
| 21 | **Device stage** — dark backdrop with scaled device chrome | `createDevicePreview()` L493-615 | P1 |
| 22 | **Iframe bridge** — child script: READY, SCROLL, RESIZE, NAVIGATED messages | `initIframeBridge()` L295-479 | P0 (core) |
| 23 | **Pin overlay on iframe** — transparent div over iframe for click-to-pin | `deviceOverlayEl` L563 | P0 |
| 24 | **Scroll sync** — overlay translates by -scrollY; wheel events forwarded | `syncDeviceOverlayScroll()` L786-789 | P0 |
| 25 | **Cross-page nav in iframe** — host commands `NAVIGATE`, iframe adds `embed=1` | L343-380 | P1 |
| 26 | **Device scaling** — `transform: scale()` to fit available viewport | `scaleDeviceFrame()` L627-643 | P1 |

### 2.4 Rich Composer
| # | Feature | WP Source | Priority |
|---|---------|-----------|----------|
| 27 | **Contenteditable input** — not textarea; allows inline rich content | `buildComposer()` L1290-1446 | P0 |
| 28 | **Circular send button** — inside input, enabled when content exists | L1340-1347 | P0 |
| 29 | **@mention autocomplete** — type @ → popup with user search, arrow/enter select | `initMentions()` L1452-1543 | P1 |
| 30 | **File attachment** — paperclip button, drag-drop, progress bar, chips | `createAttachmentManager()` L1256-1284 | P1 |
| 31 | **Auto URL linkification** — space after URL wraps in `<a>` tag | `formatLastToken()` L169-204 | P2 |
| 32 | **Actions row** — @ and 📎 buttons, hidden until content | L1352-1396 | P1 |

### 2.5 Screenshots
| # | Feature | WP Source | Priority |
|---|---------|-----------|----------|
| 33 | **Auto-screenshot** — html2canvas capture after pin creation | `autoScreenshot()` L1700-1754 | P1 |
| 34 | **Screenshot from iframe** — postMessage to child for capture | `captureIframeScreenshot()` L753-778 | P1 |
| 35 | **Screenshot thumbnail** — in popover/detail with lightbox | `renderScreenshot()` L1549-1585 | P1 |
| 36 | **Screenshot editor** — crop, draw, arrow, text tools, undo/redo | `screenshot-editor.js` full | P2 |

### 2.6 Author & Meta
| # | Feature | WP Source | Priority |
|---|---------|-----------|----------|
| 37 | **Author avatar + name + time-ago** | `renderAuthorMeta()` L1244-1250 | P0 |
| 38 | **Attachment chips** — rendered below messages | `renderAttachments()` L1229-1240 | P1 |
| 39 | **Mention highlighting** — `@name` styled in content | `renderContent()` L1218-1227 | P1 |
| 40 | **Toast notifications** | `showToast()` L991-996 | P0 |
| 41 | **Confirm dialogs** | `showConfirm()` L1002-1012 | P1 |
| 42 | **Portal menus** — "⋯" more-actions, body-appended | `buildMoreMenu()` L1023-1071 | P1 |
| 43 | **Copy link** — share URL to clipboard | `copyLink()` L1083-1095 | P1 |

---

## 3. Architecture

### 3.1 Route Structure

```
/p/:projectSlug/workspace    — NEW: iframe workspace page (React)
/api/v1/projects/:id/members/search?q=  — NEW: user search for @mentions
```

No new DB tables. Existing models cover everything:
- `Thread` (with x_pct, y_pct, viewport, contextType, pageUrl, pageTitle)
- `ThreadEnvironment` (browser metadata)
- `Comment` (replies)
- `Attachment` (files)
- `Mention` (references)

### 3.2 Auth Flow for Workspace

The workspace page is a dashboard page (session-authenticated). The iframe loads the project's `base_url` — a **different origin**. This means:

1. **Overlay runs in the Next.js app** (same origin as API) → full session auth
2. **Iframe content is the customer's site** (different origin) → no auth needed, just renders
3. **Pin overlay sits ON TOP of the iframe** in the parent window
4. **No iframe bridge needed initially** — pins are positioned as % of iframe viewport, scroll handled by overflow

For same-origin projects (self-hosted sites), the full bridge protocol can be enabled later.

### 3.3 Component Architecture

```
WorkspacePage (Next.js page)
├── WorkspaceToolbar
│   ├── ViewportSwitcher (Desktop / Tablet / Mobile)
│   ├── FilterBar (status, scope)
│   └── InteractModeToggle
├── WorkspaceContent (flex row)
│   ├── IframeContainer
│   │   ├── <iframe> (project baseUrl)
│   │   └── PinOverlay (absolute positioned)
│   │       ├── PinMarker[] (existing threads)
│   │       ├── DraftPin (new pin being created)
│   │       └── PinPopover (hover/click)
│   └── SidePanel (320px, optional)
│       ├── ThreadList (with filters)
│       ├── ThreadDetail (with replies)
│       └── PinComposer (inline)
├── Toast
├── ConfirmDialog
└── ScreenshotEditor (modal, P2)
```

### 3.4 Embed Script Prep (Future)

The existing `overlay.js` + `OverlayModule` API already supports external embedding. To add "Get embed code":

1. **Already done:** `ApiKeyGuard`, `POST /overlay/threads`, `GET /overlay/config`
2. **Already done:** Project settings page shows API key + `<script>` tag
3. **Future:** Enhance `overlay.js` to match workspace feature parity

No additional work needed for embed prep — it's already scaffolded.

---

## 4. UI Flow

```
Project List Page (/o/:orgSlug/projects)
  ┌─────────────────────────────────┐
  │ Project: Evala.cz               │
  │ https://evala.cz                │
  │                                 │
  │  [Feedback]  [Settings]         │  ← NEW: Feedback button
  └─────────────────────────────────┘
         │
         ▼ (opens new tab)
  /p/evala/workspace
  ┌─────────────────────────────────────────────────────┐
  │ Toolbar: [Desktop|Tablet|Mobile] [Open|Resolved]    │
  │          [This page|All pages]  [I interact]        │
  ├──────────────────────────────┬──────────────────────┤
  │                              │ Side Panel (320px)   │
  │   ┌──────────────────────┐   │ ┌──────────────────┐ │
  │   │  iframe: evala.cz    │   │ │ Thread list      │ │
  │   │                      │   │ │ - #1 Bug on nav  │ │
  │   │   📌 ← pin marker    │   │ │ - #2 Logo wrong  │ │
  │   │                      │   │ │                  │ │
  │   │  [click to pin]      │   │ │ [New thread]     │ │
  │   │                      │   │ └──────────────────┘ │
  │   └──────────────────────┘   │                      │
  └──────────────────────────────┴──────────────────────┘
```

---

## 5. Migration Plan: WP Plugin → React Components

| WP Plugin (vanilla JS) | React Component | Notes |
|------------------------|-----------------|-------|
| `buildUI()` + FAB | `WorkspacePage` + `WorkspaceToolbar` | Full page layout |
| `.wpf-panel` | `SidePanel` component | Slide-in drawer |
| `showListView()` + `renderThreadList()` | `ThreadList` component | With filters |
| `showDetailView()` + `renderDetail()` | `ThreadDetail` component | With reply form |
| `buildOverlay()` + `overlayEl` | `PinOverlay` component | Transparent div |
| `createPinMarker()` | `PinMarker` component | Positioned at x%/y% |
| `showPinComposer()` | `PinComposer` component | Inline form |
| `openPopover()` / `openPreviewPopover()` | `PinPopover` component | Hover/click states |
| `buildComposer()` | `Composer` component | Contenteditable |
| `initMentions()` | `MentionAutocomplete` component | With user search |
| `createAttachmentManager()` | `AttachmentManager` component | Upload + chips |
| `captureViewportScreenshot()` | `useScreenshot` hook | html2canvas |
| `screenshot-editor.js` | `ScreenshotEditor` component | Canvas-based (P2) |
| `showToast()` | `Toast` component | Notification system |
| `showConfirm()` | `ConfirmDialog` component | Modal dialog |
| `buildMoreMenu()` | `MoreMenu` component | Portal dropdown |
| Filter bar (viewport/scope/status) | `FilterBar` component | Segmented controls |
| Interact mode (I key) | `useInteractMode` hook | Toggle pointer events |
| Device preview (iframe bridge) | `useIframeBridge` hook | postMessage protocol |

### CSS Migration
- Port `frontend.css` (2462 lines) classes to Tailwind equivalents
- Keep `.wpf-*` prefix as `workspace-*` for isolation
- Match exact colors, spacings, shadows, animations

---

## 6. Roadmap Placement

This is **Phase 2.5** — between the current Phase 2 (overlay/tasks) and Phase 3 (notifications):

| Step | Scope | Est. |
|------|-------|------|
| **2.5a** | API additions: user search endpoint, thread PATCH for pin drag | 0.5d |
| **2.5b** | Workspace page layout: iframe + toolbar + panel shell | 1d |
| **2.5c** | Pin overlay + markers + click-to-pin + composer | 1.5d |
| **2.5d** | Thread list + detail + reply form in side panel | 1d |
| **2.5e** | Filter bar (viewport/scope/status) + resolve toggle | 0.5d |
| **2.5f** | Popover (preview + full) on pin hover/click | 1d |
| **2.5g** | Interact mode + keyboard shortcuts + scroll-through | 0.5d |
| **2.5h** | @mention autocomplete + file attachments in composer | 1d |
| **2.5i** | Screenshot capture + thumbnail + lightbox | 1d |
| **2.5j** | Screenshot editor (crop, draw, arrow, text) | 1.5d |
| **2.5k** | Device preview (tablet/mobile chrome + scaling) | 1d |
| **2.5l** | Polish: animations, toast, confirm, deep-linking, drag | 1d |
| **Total** | | **~11d** |

---

## 7. Task Breakdown with Acceptance Criteria

### Task 2.5a — API Additions
- [ ] `GET /api/v1/projects/:projectId/members/search?q=` — returns members with `id`, `displayName`, `avatarUrl`
- [ ] `PATCH /api/v1/projects/:projectId/threads/:threadId` — support `xPct`, `yPct` update (pin drag)
- [ ] Verify existing thread CRUD endpoints return all fields needed by workspace (author, replies, attachments, mentions, environment)
- **AC:** API build passes, endpoints return expected shapes

### Task 2.5b — Workspace Page Shell
- [ ] Create `/p/:projectSlug/workspace/page.tsx` — full-screen layout
- [ ] Add "Feedback" button to project cards on `/o/:orgSlug/projects`
- [ ] Iframe loads `project.baseUrl`, fills available space
- [ ] Toolbar with project name, viewport switcher, back button
- [ ] Side panel with slide animation (320px right)
- **AC:** Page loads, iframe shows project site, panel slides open/closed

### Task 2.5c — Pin Overlay + Markers + Composer
- [ ] Transparent overlay div on top of iframe
- [ ] Click overlay → create draft pin at x%/y% → show composer
- [ ] Composer: contenteditable input, send button, cancel on Esc
- [ ] Submit → `POST /threads` with `contextType: 'pin'`, `xPct`, `yPct`
- [ ] Existing thread pins rendered as markers at stored positions
- **AC:** Can click to place pin, type message, submit, see pin appear

### Task 2.5d — Thread List + Detail + Replies
- [ ] Side panel list view: thread items with author, preview, reply count, time
- [ ] Click thread item → detail view with full message, replies, reply form
- [ ] Reply form: contenteditable, submit → `POST /threads/:id/comments`
- [ ] Back button returns to list
- **AC:** Can browse threads, view details, post replies

### Task 2.5e — Filter Bar + Resolve
- [ ] Viewport filter: Desktop / Tablet / Mobile segmented control
- [ ] Status filter: Open (N) / Resolved (N) with counts
- [ ] Scope filter: This page / All pages
- [ ] Resolve/reopen toggle (checkmark button) on threads
- **AC:** Filters change displayed threads, resolve updates status

### Task 2.5f — Pin Popover
- [ ] Hover pin → preview popover (author + message + reply count)
- [ ] Click pin → full popover (thread + replies + reply form)
- [ ] Popover positions next to pin, flips at edges
- [ ] Close on X, Esc, or click outside
- **AC:** Hover/click behavior matches WP plugin

### Task 2.5g — Interact Mode + Keyboard
- [ ] Press I → toggle interact mode (overlay pointer-events: none)
- [ ] Escape cascade: interact → composer → popover → panel close
- [ ] Scroll-through: wheel events on overlay forward to iframe scroll
- [ ] Inspect indicator pill shows mode state
- **AC:** Can interact with iframe content, keyboard shortcuts work

### Task 2.5h — @Mentions + Attachments
- [ ] Type @ in composer → autocomplete popup with project members
- [ ] Arrow keys navigate, Enter/Tab selects, Esc closes
- [ ] Mention stored as styled span in contenteditable
- [ ] Paperclip button → file upload via presigned URL + confirm
- [ ] Attachment chips below composer, removable
- [ ] Drag-drop files onto composer
- **AC:** Can @mention users, attach files, see them in thread detail

### Task 2.5i — Screenshot Capture
- [ ] Auto-capture viewport screenshot after pin creation (html2canvas or iframe bridge)
- [ ] Upload screenshot → attach to thread
- [ ] Thumbnail in popover/detail, click for lightbox
- [ ] Status chip near pin during capture ("Capturing… Uploading… Done")
- **AC:** Screenshots auto-captured and visible in threads

### Task 2.5j — Screenshot Editor (P2)
- [ ] Modal canvas editor: crop, freehand draw, arrow, text tools
- [ ] Color picker (8 swatches), size slider
- [ ] Undo/redo via operation replay
- [ ] Save → upload edited image, PATCH thread
- **AC:** Full edit cycle: open → annotate → save → see updated screenshot

### Task 2.5k — Device Preview (P1)
- [ ] Tablet (768×1024) and Mobile (375×812) device chrome
- [ ] Iframe resized to device dimensions, scaled to fit viewport
- [ ] Pin overlay on top of device iframe
- [ ] Scroll sync via pin overlay transform
- **AC:** Can switch to tablet/mobile view, place pins on device preview

### Task 2.5l — Polish
- [ ] Toast notification system
- [ ] Confirm dialog for destructive actions
- [ ] Pin drag (existing + draft pins)
- [ ] Deep-linking: URL reflects current thread + viewport
- [ ] Cross-page navigation: click thread on different page → iframe navigates
- [ ] Panel state persistence across navigations
- [ ] Animations: panel slide, pin highlight, composer shake
- **AC:** Feature parity with WP plugin UX

---

## 8. Files to Create/Modify

### New Files (apps/web)
```
src/app/(dashboard)/p/[projectSlug]/workspace/page.tsx     — Main workspace page
src/components/workspace/
  WorkspaceToolbar.tsx        — Top toolbar
  SidePanel.tsx               — Right side drawer
  ThreadList.tsx              — Thread list view
  ThreadDetail.tsx            — Thread detail + replies
  PinOverlay.tsx              — Transparent pin layer
  PinMarker.tsx               — Individual pin marker
  PinComposer.tsx             — New thread form at pin location
  PinPopover.tsx              — Thread popover (preview + full)
  Composer.tsx                — Rich contenteditable input
  MentionAutocomplete.tsx     — @mention popup
  AttachmentManager.tsx       — File upload + chips
  FilterBar.tsx               — Viewport/scope/status filters
  Toast.tsx                   — Notification toast
  ConfirmDialog.tsx           — Destructive action confirm
  MoreMenu.tsx                — Portal dropdown menu
  ScreenshotEditor.tsx        — Canvas image editor (P2)
  DevicePreview.tsx           — Tablet/mobile chrome (P1)
src/hooks/
  useWorkspaceState.ts        — Central state management
  useInteractMode.ts          — I-key toggle
  useIframeBridge.ts          — postMessage protocol
  useScreenshot.ts            — html2canvas capture
```

### Modified Files
```
src/app/(dashboard)/o/[orgSlug]/projects/page.tsx   — Add "Feedback" button
src/lib/api.ts                                       — Add workspace API methods
```

### New API Files (apps/api)
```
src/projects/projects.controller.ts   — Add member search endpoint
```

---

## 9. Key Constraints

1. **Must feel identical to WP plugin** — same overlay behavior, same panel layout, same pin interaction
2. **Session-authenticated** — no API keys needed, user is logged in via dashboard
3. **Cross-origin iframe** — pins are positioned relative to iframe viewport, not iframe content (initially)
4. **No iframe modification** — the customer's site loads unmodified; all UI is in the parent
5. **Responsive** — toolbar and panel adapt to screen size
6. **Accessible** — keyboard navigation, ARIA labels, focus management (matching WP plugin)

---

## 10. What's Already Done (Reusable)

From Phase 1-2, these are ready:
- ✅ Thread CRUD API (create, list, get, update, delete)
- ✅ Comment/reply API
- ✅ Attachment presign + confirm API
- ✅ Mention extraction + storage
- ✅ Thread environment capture
- ✅ Session auth + CSRF
- ✅ API key + overlay endpoints (for future embed)
- ✅ Prisma models (Thread, Comment, Attachment, Mention, ThreadEnvironment)
- ✅ `api.ts` client with CSRF handling
