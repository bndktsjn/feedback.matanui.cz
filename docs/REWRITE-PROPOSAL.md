# Feedback App Rewrite: Research Report & Architecture Proposal

## Table of Contents
1. [Competitor Deep-Dive](#1-competitor-deep-dive)
2. [Current App Audit](#2-current-app-audit)
3. [Key Insight: What Makes Their UX Superior](#3-key-insight)
4. [Proposed Architecture](#4-proposed-architecture)
5. [Migration Plan](#5-migration-plan)
6. [Risk Assessment](#6-risk-assessment)

---

## 1. Competitor Deep-Dive

### 1.1 BugHerd

**Script Loading**
- Single `<script>` tag in `<head>` with project-specific URL
- Script loads asynchronously; bootstraps a full sidebar + pin overlay
- Auth: user must be logged into BugHerd website; script checks session cookie against BugHerd's domain via API call
- No API key in the script tag — auth is cookie-based (logged-in BugHerd users see the sidebar)

**Overlay Architecture**
- Injects a fixed sidebar on the right side of the client's page
- Sidebar is a full task management UI (kanban columns: Backlog, To Do, Doing, Done)
- Pin mode: user clicks an element → BugHerd captures a **CSS selector** for that element
- Pin positioning: stored as a CSS selector + relative offset, NOT as percentage coordinates
- This means pins **survive layout changes** — they're anchored to DOM elements, not absolute positions

**Screenshot Capture**
- Uses html2canvas for client-side capture
- Also captures: browser, OS, screen resolution, CSS selector of clicked element, console logs
- Screenshots are annotated (draw/highlight tools) before submission

**Cross-Origin Strategy**
- Script runs directly on the client site — **zero cross-origin issues**
- No iframes for the feedback experience itself
- Admin dashboard at bugherd.com is completely separate — views data via API
- Browser extension as alternative installation method

**Key Differentiator**: Element-anchored pins via CSS selectors; full kanban board in the overlay sidebar.

---

### 1.2 Marker.io

**Script Loading**
```html
<script>
  window.markerConfig = { project: 'PROJECT_ID' };
</script>
<script src="https://edge.marker.io/latest/shim.js" async></script>
```
- Two-part: config object + async loader (shim.js)
- shim.js is tiny (~2KB); it lazy-loads the full widget bundle only when activated
- Global `window.Marker` SDK exposed for programmatic control

**Overlay Architecture**
- Floating button (bottom-right) — click to activate
- Capture modes: `fullscreen` (viewport), `advanced` (area select / full page / desktop)
- After capture → annotation editor (draw, highlight, text, arrows)
- Form: title, description, assignee, labels — all in an overlay panel
- Widget runs **entirely in the page context** — no iframe for the feedback UI

**Screenshot Capture**
- Primary: html2canvas (client-side DOM rendering)
- Fallback: native browser `getDisplayMedia` API (actual pixel-perfect screenshot)
- Cross-domain iframes: optional `iframe.support.js` script injected into iframe content
- Server-side rendering option available for complex pages

**SDK API**
- `Marker.capture()`, `Marker.show()`, `Marker.hide()`, `Marker.unload()`
- `Marker.setReporter({ email, fullName })` — pre-identify users
- `Marker.setCustomData({})` — attach metadata
- Event hooks: `beforeCapture`, `afterCapture`, `load`, `show`, `hide`
- Silent mode to suppress console logs

**Cross-Origin Strategy**
- Script runs in page context — zero cross-origin for the overlay itself
- For iframes within the page: optional `iframe.support.js` helper script
- Browser extension as iframe capture fallback

**Key Differentiator**: Two-stage loading (tiny shim → full bundle on demand); rich SDK API; server-side screenshot fallback; annotation tools.

---

### 1.3 MarkUp.io

**Script Loading**
- URL-based approach: paste any URL into MarkUp.io dashboard
- MarkUp.io loads the target site in a **server-side proxy/renderer**
- No script installation required for basic use
- For live sites: browser extension or embedded script option

**Overlay Architecture**
- Proxy-based: MarkUp.io renders the target page server-side and overlays annotation tools
- Pins positioned as percentage coordinates relative to page dimensions
- Supports 30+ file types (websites, images, PDFs, videos)
- Annotations: point, rectangle, arrow, text
- Comments attached to specific coordinates/areas

**Cross-Origin Strategy**
- Proxy model bypasses CORS entirely — the page is loaded server-side
- For live/dynamic sites: browser extension captures the DOM state

**Key Differentiator**: No installation needed (URL-paste model); multi-format support; server-side proxy eliminates cross-origin.

---

### 1.4 FeedBucket

**Script Loading**
```html
<script src="https://app.feedbucket.app/sdk/widget.js?pid=PROJECT_ID"></script>
```
- Single script tag with project ID as query parameter
- Script is self-contained — no config object needed
- WordPress plugin available for no-code installation

**Overlay Architecture**
- Floating feedback button → opens annotation toolbar
- Screenshot + recording modes (screen recording via MediaRecorder API)
- Pin annotations on page elements
- After capture → form with title, description, type
- Widget runs directly in page context

**Screenshot Capture**
- Client-side html2canvas
- Screen recording via browser MediaRecorder API
- Captures: screenshot, console logs, browser info, page URL, screen resolution

**Cross-Origin Strategy**
- Script runs in page context — zero cross-origin
- Submits feedback to FeedBucket API with project ID auth
- Two-way sync with PM tools (Asana, ClickUp, Jira, etc.)

**Key Differentiator**: Screen recording capability; deep 2-way PM tool integrations; simple single-script installation.

---

## 2. Current App Audit

### 2.1 Existing Features to Preserve

| Category | Features |
|----------|----------|
| **Auth** | Register, login, logout, forgot/reset password, email verification, change email, change password, avatar upload, delete account |
| **Orgs** | Create, list, update, delete orgs; manage members (add/remove/role); invitation system (invite by email, accept, revoke, resend) |
| **Projects** | Create, list, update, delete; slug-based URLs; base URL; description; settings (apiKey, allowAnonymousComments, publicWorkspace); URL rules |
| **Threads** | Create, list, get, update, soft-delete; status (open/in_progress/resolved/closed); priority (low/medium/high/critical); type (general/bug/design/content); context type (pin/panel); viewport (desktop/tablet/mobile); pin coordinates (xPct/yPct); anchorData JSON; targetSelector; screenshotUrl; pageUrl+pageTitle; guestEmail; createdVia; resolution tracking |
| **Comments** | Create, list, update, delete per thread; guest email support; @mentions |
| **Attachments** | Polymorphic (thread/comment); file upload via MinIO; filename, storageKey, url, mimeType, sizeBytes |
| **Tasks/Kanban** | Tasks linked to threads; kanban columns; status/priority/assignee/dueDate; drag positioning; task history |
| **Mentions** | Polymorphic mention system; user search endpoint |
| **Environment** | Per-thread: browser, OS, viewport, DPR, user agent |
| **Widget (overlay.js)** | Dual-mode: widget mode (floating button + form) and bridge mode (iframe ↔ parent postMessage) |
| **Screenshots** | html2canvas capture in both widget and bridge modes; pin marker drawing on canvas; base64 upload |
| **Admin Workspace** | Iframe-based page preview; pin overlay; thread list/detail sidebar; viewport switching (desktop/tablet/mobile); toolbar; popovers; screenshot editor/lightbox; keyboard shortcuts |

### 2.2 Current Architecture (What Exists)

```
Client site (wp.matanui.cz):
  <script src="feedback.matanui.cz/static/overlay.js" data-key="fb_xxx">
  └─ Widget mode: floating button → form → POST /api/v1/overlay/threads
  └─ Bridge mode (when in iframe): postMessage ↔ parent workspace

Admin (feedback.matanui.cz):
  /p/[slug]/workspace  ← Iframe-based workspace
    ├── IframeViewer   ← Loads client site in iframe
    ├── useBridge hook ← postMessage communication layer
    ├── PinOverlay     ← Renders pins on top of iframe
    ├── PinMarker      ← Individual pin components
    ├── SidePanel      ← Thread list + detail
    ├── Toolbar        ← Viewport switch, pin mode, filters
    └── Popovers       ← Thread preview on pin hover/click

API (NestJS):
  /v1/overlay/*        ← Widget endpoints (API key auth)
  /v1/projects/*/threads/* ← Admin endpoints (session auth)
  /v1/auth/*           ← Authentication
  /v1/orgs/*           ← Organization management
  Static file serving  ← overlay.js
```

### 2.3 Current Problems

1. **Iframe bridge fragility**: postMessage-based URL sync is unreliable; stale `currentPageUrl` causes wrong pins to display after navigation
2. **Pin scroll desync**: Pins positioned absolutely over the iframe lose sync when content scrolls; requires complex scroll transform workaround
3. **Cross-origin complexity**: Bridge timeout fallbacks, heartbeat pings, direct URL read attempts — all to work around iframe cross-origin limitations
4. **Dual-mode overlay.js**: 605 lines serving two very different purposes (widget UI + bridge protocol); neither is done well
5. **No CSS selector anchoring**: Pins stored as percentage coordinates (xPct/yPct) — fragile, break on layout changes
6. **No annotation tools**: Can't draw/highlight on screenshots before submitting
7. **No lazy loading**: Full overlay.js loads immediately even if never activated
8. **Widget UX is basic**: Simple form vs. competitors' rich capture → annotate → submit flow

---

## 3. Key Insight: What Makes Their UX Superior

### The Universal Pattern

**Every successful competitor follows the same architecture:**

```
┌─────────────────────────────────────────────────┐
│  CLIENT SITE (any website)                       │
│                                                  │
│  <script src="agent.js?key=XYZ">                │
│     ↓                                            │
│  Agent runs IN the page context:                 │
│  • Injects overlay UI (button + panel + tools)  │
│  • Captures screenshots (same-origin = trivial)  │
│  • Reads DOM (CSS selectors, scroll, etc.)      │
│  • Submits to API directly (fetch + API key)    │
│                                                  │
│  Zero cross-origin. Zero iframes. Zero bridge.  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  ADMIN DASHBOARD (separate app)                  │
│                                                  │
│  • Views submitted feedback via API              │
│  • Thread management, comments, status           │
│  • Page preview (optional, read-only)            │
│  • No pin placement from dashboard               │
│  • Pure data management UI                       │
└─────────────────────────────────────────────────┘
```

### Why This Is Superior

| Problem | Current (iframe bridge) | Industry (in-page agent) |
|---------|------------------------|--------------------------|
| Pin positioning | Percentage over iframe → scroll desync | Same-origin DOM → CSS selector anchoring |
| URL detection | postMessage bridge → stale closures | `location.href` directly → always correct |
| Screenshots | Cross-origin html2canvas delegation | Same-origin html2canvas → trivial |
| Scroll sync | Transform hacks on overlay div | Pins are IN the DOM → scroll naturally |
| Page navigation | Bridge must detect + report → race conditions | Agent reads `location.href` → instant |
| Complexity | ~950 lines (useBridge + overlay bridge + PinOverlay) | ~400 lines (agent runs in page) |
| Mobile support | iframe-in-iframe complications | Native — runs on any device |

**The fundamental insight: when you run in the page, ALL cross-origin problems disappear. The iframe workspace approach is architecturally wrong for a feedback tool.**

---

## 4. Proposed Architecture

### 4.1 High-Level Design

```
┌─ CLIENT SITE ──────────────────────────────────────────────┐
│                                                             │
│  <script src="feedback.matanui.cz/agent.js?key=fb_xxx">   │
│                                                             │
│  agent.js (~8KB gzipped):                                  │
│  ├── Shim loader (1KB) → lazy-loads full agent on activate │
│  ├── Floating trigger button                                │
│  ├── Pin mode (click element → CSS selector + offset)      │
│  ├── Screenshot capture (html2canvas, lazy-loaded)          │
│  ├── Annotation layer (draw, highlight, text)               │
│  ├── Feedback form (title, message, type, priority)         │
│  ├── Existing pins display (fetch from API)                │
│  ├── Comment thread view (inline per pin)                   │
│  └── POST to /api/v1/overlay/* (API key auth)              │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─ ADMIN DASHBOARD (feedback.matanui.cz) ────────────────────┐
│                                                             │
│  /dashboard (replaces /workspace)                          │
│  ├── Project overview: thread list, filters, search         │
│  ├── Thread detail: comments, attachments, status, assign   │
│  ├── Page preview: read-only iframe OR screenshot gallery   │
│  ├── Kanban board (existing)                                │
│  ├── Settings: project config, members, API key             │
│  └── All data via same API (session auth)                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─ API (NestJS, unchanged core) ─────────────────────────────┐
│                                                             │
│  Overlay endpoints (API key auth):                         │
│  ├── GET  /overlay/config          ← agent config          │
│  ├── GET  /overlay/threads         ← pins for current page │
│  ├── POST /overlay/threads         ← create feedback       │
│  ├── POST /overlay/threads/:id/comments ← add comment     │
│  ├── GET  /overlay/threads/:id     ← thread detail         │
│  └── POST /overlay/upload          ← screenshot upload     │
│                                                             │
│  Admin endpoints (session auth): UNCHANGED                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Agent Design (agent.js)

**Loading Strategy** (Marker.io pattern):
```
Phase 1 — Shim (~1KB):
  • Parse API key from script tag
  • Attach keyboard shortcut listener (Ctrl+Shift+F)
  • Create floating trigger button
  • On activate → load Phase 2

Phase 2 — Full agent (~7KB gzipped):
  • Inject styles (Shadow DOM to avoid CSS conflicts)
  • Initialize pin overlay
  • Fetch existing pins for current page
  • Set up navigation detection (pushState/popstate/hashchange)
  • Register capture handlers
```

**Pin Positioning** (BugHerd pattern):
```javascript
// On click in pin mode:
{
  // Primary: CSS selector (survives layout changes)
  targetSelector: "main > article:nth-child(2) > .card-body > p:first-of-type",

  // Fallback: percentage coordinates (for elements that can't be uniquely selected)
  xPct: 45.2341,
  yPct: 23.5678,

  // Anchor data: element bounding rect relative to viewport at capture time
  anchorData: {
    tagName: "P",
    textPreview: "Lorem ipsum dolor...",
    rect: { top: 234, left: 120, width: 600, height: 20 },
    scrollY: 450
  }
}
```

**Pin Display**: Pins are `position: absolute` DIVs appended to `document.body`, positioned by:
1. Try `document.querySelector(targetSelector)` → get element rect → position relative to it
2. Fallback to percentage coordinates relative to `document.documentElement.scrollWidth/Height`
3. Pins scroll naturally with the page (they're IN the DOM)

**Screenshot Capture**:
```
1. User activates capture → html2canvas loaded lazily
2. Capture viewport (or full page)
3. Annotation editor overlay appears
4. User draws/highlights/types
5. Final canvas → base64 → POST to API
```

### 4.3 Admin Dashboard Refactor

**Remove**: IframeViewer, useBridge hook, PinOverlay (iframe overlay), scroll transform logic

**Keep**: SidePanel, ThreadList, ThreadDetail, Composer, ThreadMenu, Toolbar (adapted), Kanban, all auth/org/project pages

**Add/Change**:
- Thread list page with screenshot thumbnails and page URL grouping
- Thread detail with inline screenshot viewer (no iframe needed)
- Optional: read-only iframe preview (simple, no bridge — just shows the page)
- Pin locations shown on the stored screenshot image (draw pin markers on screenshot)

### 4.4 Shadow DOM Isolation

The agent's UI must not be affected by the host site's CSS:
```javascript
const host = document.createElement('div');
host.id = 'fb-agent';
const shadow = host.attachShadow({ mode: 'closed' });
// All agent UI lives inside shadow DOM
// Host site CSS cannot leak in
document.body.appendChild(host);
```

### 4.5 API Changes

**New overlay endpoints needed**:
| Endpoint | Purpose |
|----------|---------|
| `GET /overlay/threads?pageUrl=X&viewport=Y` | Fetch pins for current page (agent displays them) |
| `GET /overlay/threads/:id` | Thread detail with comments (agent shows inline) |
| `POST /overlay/threads/:id/comments` | Add comment from agent |
| `PATCH /overlay/threads/:id` | Update status from agent (resolve) |
| `POST /overlay/upload` | Upload screenshot file (not base64 in JSON) |

**Unchanged**: All existing admin API endpoints, auth system, data models.

**Schema addition** (optional, Phase 2):
```prisma
// Add to Thread model:
cssSelector    String?  @map("css_selector") @db.VarChar(1024)
elementPreview String?  @map("element_preview") @db.Text
```

---

## 5. Migration Plan

### Phase 2: Core Overlay Agent (~3 days)

**Goal**: Working agent.js that replaces both widget mode and bridge mode.

1. **agent-shim.js** (~50 lines): Loader + trigger button + keyboard shortcut
2. **agent-core.js** (~300 lines): Pin mode, screenshot capture, form UI, API submission
3. **agent-pins.js** (~150 lines): Fetch + display existing pins for current page
4. **Shadow DOM styles**: Complete CSS for agent UI
5. **Navigation detection**: pushState/popstate/hashchange interception

**Deliverable**: `<script src="agent.js?key=XYZ">` works on wp.matanui.cz — can create feedback with pins and screenshots.

### Phase 3: Admin Dashboard Refactor (~2 days)

**Goal**: Dashboard that manages feedback without iframe bridge complexity.

1. Replace workspace page with thread-list-first view
2. Thread detail with screenshot viewer + comment thread
3. Keep: viewport filter, status filter, page URL filter, kanban
4. Remove: IframeViewer, useBridge, PinOverlay, bridge-related code
5. Optional: simple read-only iframe preview (no bridge, no pins)

**Deliverable**: Admin at feedback.matanui.cz manages all feedback; no bridge bugs.

### Phase 4: API Adjustments (~1 day)

1. Add `GET /overlay/threads` with pageUrl filter
2. Add `POST /overlay/threads/:id/comments`
3. Add `PATCH /overlay/threads/:id` for status updates
4. Multipart upload endpoint for screenshots
5. All behind existing API key guard

**Deliverable**: Agent can read + write all data it needs.

### Phase 5: Integration Testing (~1 day)

1. Deploy agent.js to feedback.matanui.cz/static/agent.js
2. Update wp.matanui.cz script tag
3. End-to-end: create pin → see in dashboard → comment → resolve
4. Test: navigation detection, screenshot capture, multiple viewports
5. Verify: all existing data still accessible in dashboard

**Deliverable**: Production-ready system on wp.matanui.cz.

---

## 7. Implementation Progress

### Completed (March 2026)

**Phase 1: Research + Proposal** ✅
- Competitor deep-dive (BugHerd, Marker.io, Userback)
- Current app audit
- Architecture proposal (this document)

**Phase 2: Core Overlay Agent** ✅
- New API endpoints: `GET /overlay/threads`, `GET /overlay/threads/:id`, `POST /overlay/threads/:id/comments`, `PATCH /overlay/threads/:id`
- `agent.js` (35KB) — self-contained vanilla JS in-page feedback widget:
  - Shadow DOM isolation, floating trigger button
  - Pin mode with CSS selector capture + percentage coordinates
  - Screenshot capture via html2canvas
  - Form with title, type, priority, message
  - Existing pins display (fetched from API)
  - Thread detail view with commenting
  - SPA navigation detection (pushState/popstate/hashchange)
  - Keyboard shortcuts, pin repositioning on scroll/resize
- Deployed to `https://feedback.matanui.cz/static/agent.js`
- WordPress site updated: agent.js (widget) + overlay.js (bridge compat)

**Phase 3: Admin Dashboard Enhancement** ✅
- Pin markers on screenshots in threads dashboard
- Page URL filter for thread list
- Screenshot lightbox with pin overlay
- "View in workspace" links
- Thread detail page: avatar, environment grid, pin-on-screenshot
- Pin dot indicators on list thumbnails

### Remaining

**Phase 4: Full Migration**
- Remove iframe bridge dependency from admin workspace
- Migrate workspace page to thread-list-first view
- Remove dead bridge code (useBridge, PinOverlay iframe integration)

**Phase 5: Production Hardening**
- Offline queue in agent.js
- Mobile responsiveness audit
- Performance optimization
- Full regression testing

---

## 6. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Shadow DOM browser compat | Low | Supported in all modern browsers (97%+ coverage); fallback to scoped styles |
| html2canvas quality | Medium | Already using it; add native `getDisplayMedia` as optional fallback |
| CSS selector stability | Medium | Store selector + percentage fallback + text preview for matching |
| Existing data migration | None | Schema is unchanged; new fields are additive |
| Breaking existing widget users | Low | Keep old overlay.js serving for transition period; new agent.js at new URL |
| Admin workflow disruption | Medium | Dashboard still shows all threads; just removes broken iframe pin preview |

---

## Recommendation: REPLACE

**Verdict**: Replace the iframe bridge architecture with an in-page agent.

The current iframe bridge approach is **architecturally unsuitable** for a feedback tool. Every competitor has converged on the same pattern: agent script runs in-page, zero cross-origin, pins in the DOM. The bridge adds ~1000 lines of complexity to solve problems that simply don't exist in the correct architecture.

The migration preserves ALL existing features and data. The API changes are additive. The admin dashboard becomes simpler (no bridge debugging). The agent becomes more capable (CSS selectors, annotations, inline comments).

**Estimated total effort**: ~7 working days for a production-ready system.

---

*Awaiting your approval to proceed with Phase 2: Core Overlay Agent.*
