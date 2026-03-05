# WP Plugin Parity Audit Report & Gap Analysis

**Date**: 2025-01-XX
**Scope**: WordPress feedback plugin (`wpf-annotator`) vs SaaS workspace (`apps/web/src/app/(workspace)/p/[projectSlug]/workspace/page.tsx`)

---

## 1. Executive Summary

The SaaS workspace has a **functional skeleton** covering basic pin creation, thread listing, status toggling, reply posting, and sidebar navigation. However, it is **missing ~70% of the WP plugin's feature surface**. The gaps span every major subsystem: composer UX, popover system, pin interactions, attachments, mentions, screenshots, environment capture, deep linking, device preview bridge, and numerous polish details.

---

## 2. Feature-by-Feature Comparison

### 2.1 Pin Creation Flow

| Feature | WP Plugin | SaaS | Gap |
|---------|-----------|------|-----|
| Click overlay → draft pin | ✅ Overlay click → `showPinComposer` | ✅ `handleOverlayClick` sets `draftPin` | Functional parity |
| Coordinate system | % of document body (desktop) / iframe doc (device) | % of overlay rect | ⚠️ Overlay rect ≠ document body; fine if overlay fills iframe |
| Draft pin marker shape | Teardrop (`border-radius:50% 50% 50% 0; rotate(-45deg)`) + chat icon | Teardrop ✅ | Match |
| Draft pin draggable | ✅ `makeDraftPinDraggable` — repositionable before submit | ❌ Fixed position only | **GAP** |
| Composer type | ContentEditable `<div>` with rich features | Plain `<textarea>` | **GAP** |
| Auto-linkify URLs | ✅ On space, wraps URLs in `<a>` tags | ❌ | **GAP** |
| Paste strips HTML | ✅ `paste` event → insertText plain | ❌ Textarea handles this natively | N/A (textarea) |
| Inline circular send button | ✅ Inside input wrap | ✅ Similar button | Minor styling diff |
| @ mention trigger | ✅ Button inserts `@` + autocomplete popup | ❌ | **GAP** |
| Attachment button + upload | ✅ Paperclip button, file input, staged uploads, progress bar, drag-drop | ❌ | **GAP** |
| Outside-click guard (shake) | ✅ Shakes composer on first outside click if ≥4 chars typed | ❌ Second click discards immediately | **GAP** |
| Composer flip (near edge) | ✅ `wpf-pin-composer--left` when `x >= 70%` | ❌ Always on same side | **GAP** |
| Auto-screenshot after create | ✅ `autoScreenshot` → html2canvas → upload → PATCH | ❌ | **GAP** |
| Auto-open thread after create | ✅ Opens popover on new pin | ✅ Opens sidebar detail | Functional parity |
| Environment capture on create | ✅ Sends `env_browser, env_os, env_viewport, env_dimensions, env_user_agent` | ❌ | **GAP** |
| Device-mode pin creation | ✅ `showDevicePinComposer` — fixed-position composer near click | ❌ | **GAP** |

### 2.2 Thread Lifecycle

| Feature | WP Plugin | SaaS | Gap |
|---------|-----------|------|-----|
| Create thread (API) | POST with all fields | POST with basic fields | ⚠️ Missing attachment_ids, mention_user_ids, env_* |
| View thread list | ✅ Panel list view | ✅ | Match |
| View thread detail | ✅ Panel detail view OR popover | ✅ Sidebar detail only | **GAP** — no popover |
| Scroll to pin | ✅ `scrollToPin` → scrollIntoView + highlight animation | ❌ Clicking list item opens sidebar but no scroll | **GAP** |
| Resolve / Reopen | ✅ Circular check button, toggles status | ✅ Similar | Match |
| Delete thread | ✅ Confirm dialog → DELETE + optimistic removal | ✅ `window.confirm` → DELETE | ⚠️ No custom confirm |
| Copy link | ✅ Deep link URL copied to clipboard | ❌ | **GAP** |
| Cross-page navigation | ✅ `navigateToThread` + sessionStorage state persistence | ❌ | **GAP** |

### 2.3 Sidebar / Panel

| Feature | WP Plugin | SaaS | Gap |
|---------|-----------|------|-----|
| Position | Fixed, overlays content, 340px | Fixed, overlays content, 320px | ✅ Close match |
| Slide animation | ✅ `transform: translateX` transition | ✅ Same approach | Match |
| Header | Title + close button | Title + close button | Match |
| Filter bar in panel | ✅ 3-row: viewport segments, scope+status, filter chips | ⚠️ In toolbar, not in panel | Different location (acceptable for SaaS) |
| Thread list items | Actions row (#ID, more menu, resolve) + author row (avatar, name, time) + message preview + reply count | Simpler: avatar initial + name + time + message + #ID + reply count + resolve | **GAP** — missing more menu, different layout |
| Page grouping (all pages) | ✅ Headers with page title + count | ✅ Similar | Match |
| Detail view — back button | ✅ `← Back` | ✅ | Match |
| Detail view — #ID | ✅ `#123` | ✅ `#abc12345` (truncated UUID) | Match |
| Detail view — more menu | ✅ Copy link, Environment, Delete | ❌ Only resolve + delete buttons | **GAP** |
| Detail view — screenshot | ✅ Thumbnail + edit + remove + lightbox | ❌ | **GAP** |
| Detail view — attachments | ✅ Attachment chips | ❌ | **GAP** |
| Detail view — reply form | ✅ Rich composer (mentions, attachments) | ✅ Plain textarea | **GAP** |
| Detail view — reply edit | ✅ Inline edit textarea + save/cancel | ❌ | **GAP** |
| Detail view — reply delete | ✅ Confirm → DELETE | ❌ | **GAP** |
| Panel auto-hide during drag | ✅ `wpf-panel--drag-hidden` | ❌ | **GAP** |
| Hover highlight pin ↔ list | ✅ `mouseenter/leave` on list item highlights pin | ❌ | **GAP** |

### 2.4 Popover System

| Feature | WP Plugin | SaaS | Gap |
|---------|-----------|------|-----|
| Preview popover (on hover) | ✅ Author + message + reply count | ✅ Similar | Match |
| Full thread popover (on click) | ✅ Complete: header, message, screenshot, attachments, replies, reply form | ❌ Opens sidebar instead | **GAP** |
| Popover positioning | ✅ Smart: right of pin, flips left near edge, device mode uses fixed | Preview only, basic positioning | **GAP** |
| Close popover on Escape | ✅ | ❌ | **GAP** |
| Cached thread data for instant open | ✅ `threadDataCache` + background refresh | ❌ Always re-fetches | **GAP** |

### 2.5 Authors & Avatars

| Feature | WP Plugin | SaaS | Gap |
|---------|-----------|------|-----|
| Avatar display | ✅ Gravatar `<img>` (20px) | ❌ Letter initial in circle | **GAP** |
| Author name | ✅ `display_name` bold | ✅ `displayName` | Match |
| Timestamp | ✅ `timeAgo` with `·` separator | ✅ `timeAgo` | Match |

### 2.6 Attachments

| Feature | WP Plugin | SaaS | Gap |
|---------|-----------|------|-----|
| Upload during compose | ✅ File input + drag-drop + progress bar + staged chips | ❌ | **MAJOR GAP** |
| Display in thread/reply | ✅ Image thumbnails + filename chips | ❌ | **MAJOR GAP** |
| API support | WP: `attachment_ids` on create, separate upload endpoint | SaaS: No upload endpoint, no attachment model | **MAJOR GAP** — needs backend work |

### 2.7 @Mentions

| Feature | WP Plugin | SaaS | Gap |
|---------|-----------|------|-----|
| @ trigger in composer | ✅ Detects `@` in ContentEditable, shows autocomplete popup | ❌ | **MAJOR GAP** |
| User search API | ✅ `wpf/v1/users?search=` | SaaS: Has `projects.memberSearch` but unused | **GAP** |
| Insert mention span | ✅ Non-editable styled `<span>` | ❌ | **MAJOR GAP** |
| Mention rendering in messages | ✅ `renderContent` highlights @mentions | ❌ Plain text | **GAP** |
| Keyboard navigation in popup | ✅ Arrow keys + Enter/Tab to select | ❌ | **GAP** |

### 2.8 Screenshots

| Feature | WP Plugin | SaaS | Gap |
|---------|-----------|------|-----|
| Auto-capture on create | ✅ html2canvas → upload → PATCH thread | ❌ | **MAJOR GAP** |
| Iframe capture (device mode) | ✅ postMessage bridge → html2canvas in iframe | ❌ | **MAJOR GAP** |
| Thumbnail display | ✅ In popover + detail view | ❌ | **GAP** |
| Screenshot editor | ✅ Full editor (crop, draw, arrow, text, undo/redo) via `screenshot-editor.js` | ❌ | **MAJOR GAP** |
| Lightbox view | ✅ Full-screen overlay with close | ❌ | **GAP** |
| Remove screenshot | ✅ Delete button → PATCH `screenshot_id: 0` | ❌ | **GAP** |
| Screenshot mode (hide UI) | ✅ `body.wpf-screenshot-mode` hides all overlay elements | ❌ | **GAP** |
| Status chip (capturing…) | ✅ Animated chip near pin during capture | ❌ | **GAP** |

### 2.9 Environment Capture

| Feature | WP Plugin | SaaS | Gap |
|---------|-----------|------|-----|
| Capture browser/OS/viewport | ✅ `getEnvironment()` on thread create | ❌ | **GAP** |
| Environment popover | ✅ Styled popup showing browser, OS, viewport, dimensions, user agent | ❌ | **GAP** |
| DB model | WP: `_wpf_environment` meta | SaaS: `Environment` Prisma model exists | Backend ready, frontend missing |

### 2.10 Deep Links

| Feature | WP Plugin | SaaS | Gap |
|---------|-----------|------|-----|
| URL scheme | ✅ `?wpf=comment&thread=ID&viewport=VP` | ❌ | **GAP** |
| Parse on load | ✅ `handleDeepLink` → enter review mode → scroll to pin | ❌ | **GAP** |
| URL sync | ✅ `syncUrlToReviewMode` → `history.replaceState` | ❌ | **GAP** |
| Cross-page panel state | ✅ `sessionStorage` persistence | ❌ | **GAP** |

### 2.11 Keyboard Shortcuts

| Feature | WP Plugin | SaaS | Gap |
|---------|-----------|------|-----|
| `I` toggle | ✅ Interact mode (inverted from SaaS) | ✅ Pin mode | Different semantics but similar |
| Escape cascade | ✅ interact → mention → portal menu → composer → popover → exit review | ⚠️ Partial: pin mode → draft pin → detail view | **GAP** — incomplete cascade |
| `I` from iframe | ✅ Forwarded via postMessage bridge | ❌ | **GAP** |
| Escape from iframe | ✅ Forwarded via postMessage bridge | ❌ | **GAP** |

### 2.12 Pin Drag & Drop

| Feature | WP Plugin | SaaS | Gap |
|---------|-----------|------|-----|
| Drag existing pins | ✅ `initPinDrag` with pointer events, saves via PATCH | ❌ | **MAJOR GAP** |
| Auto-hide panel during drag | ✅ `wpf-panel--drag-hidden` | ❌ | **GAP** |
| Restore popover after drag | ✅ Smart restore | ❌ | **GAP** |
| Visual feedback | ✅ `wpf-pin--dragging` class | ❌ | **GAP** |

### 2.13 Device Viewport Preview

| Feature | WP Plugin | SaaS | Gap |
|---------|-----------|------|-----|
| iframe + bridge communication | ✅ Full postMessage protocol (READY, SCROLL, RESIZE, NAVIGATED, KEY_DOWN, CAPTURE_SCREENSHOT, NAVIGATE) | ❌ Static iframe, no bridge | **MAJOR GAP** |
| Device chrome (notch, home bar) | ✅ Styled `.wpf-device-frame` | ⚠️ Basic rounded border | **GAP** |
| Auto-scale to fit viewport | ✅ `scaleDeviceFrame` | ❌ | **GAP** |
| Pin overlay on device iframe | ✅ Separate `deviceOverlayEl` synced to iframe scroll | ❌ | **MAJOR GAP** |
| Scroll forwarding (wheel/touch) | ✅ | ❌ | **GAP** |
| SPA navigation detection | ✅ Hooks pushState/replaceState + popstate + hashchange + fallback poll | ❌ | **GAP** |
| Cross-page thread navigation | ✅ `postToIframe NAVIGATE` | ❌ | **GAP** |

### 2.14 Miscellaneous UI

| Feature | WP Plugin | SaaS | Gap |
|---------|-----------|------|-----|
| Toast notifications | ✅ Custom styled | ✅ Custom styled | Match |
| Confirm dialog | ✅ Custom modal | ⚠️ `window.confirm` | **GAP** |
| Spinner/loading | ✅ `.wpf-spinner` | ⚠️ Text "Loading…" | **GAP** |
| More menu (portal) | ✅ Body-appended, never clipped | ❌ | **GAP** |
| Inspect mode indicator pill | ✅ Bottom-left pill with cursor icon + kbd hint | ❌ | **GAP** |
| FAB / speed dial | ✅ Bottom-right floating button | N/A (toolbar approach) | Acceptable difference |
| Persist review mode across navigation | ✅ Injects `?wpf=comment` into same-origin links | ❌ | **GAP** |
| Resolved pin badge | ✅ Green check circle on pin marker | ❌ Just opacity change | **GAP** |
| Pin highlight on scroll-to | ✅ `wpf-pin--highlight` class + timeout | ❌ | **GAP** |
| Pin ↔ list hover correlation | ✅ Highlights pin when hovering list item, and vice versa | ❌ | **GAP** |

---

## 3. Gap Severity Matrix

### Critical (Blocks core feedback UX)
1. **No popover system** — clicking pin should show inline thread, not just sidebar
2. **No pin drag** — users can't reposition pins after placement
3. **No draft pin drag** — users can't adjust pin before submitting
4. **No scroll-to-pin** — clicking list item should scroll iframe to pin location
5. **No device preview bridge** — tablet/mobile mode is non-functional for pin placement

### High (Missing major feature)
6. **No attachments** — needs backend model + upload endpoint + frontend upload manager
7. **No @mentions** — needs ContentEditable composer + autocomplete popup + user search
8. **No screenshots** — auto-capture, upload, display, edit, lightbox
9. **No environment capture** — browser/OS/viewport info on thread creation
10. **No deep linking** — URL-based thread navigation + cross-page state persistence

### Medium (UX polish gaps)
11. **No copy link** — deep link clipboard copy
12. **No more menu / portal menu** — actions currently inline
13. **No custom confirm dialog** — using `window.confirm()`
14. **No reply edit/delete** — comment CRUD missing in UI
15. **No resolved pin badge** — visual distinction
16. **No pin ↔ list hover correlation**
17. **No outside-click shake guard for composer**
18. **No composer flip near edge**
19. **Real avatars not displayed** — using letter initials instead

### Low (Nice-to-have polish)
20. **No URL auto-linkify in composer**
21. **No spinner animation** — text "Loading…" instead
22. **No inspect mode indicator pill**
23. **No panel auto-hide during drag**
24. **No pin highlight animation on scroll-to**
25. **No persist review mode across navigation**

---

## 4. Backend API Gaps

| Need | Status | Notes |
|------|--------|-------|
| Thread CRUD | ✅ Complete | All fields supported |
| Comment CRUD | ✅ Complete | Create, update, delete |
| Status counts | ✅ Complete | `status-counts` endpoint |
| pageUrl + viewport filters | ✅ Complete | Added in previous session |
| File upload endpoint | ❌ Missing | Need `/projects/:id/attachments` with multipart upload |
| Attachment model | ❌ Missing | Need Prisma model for attachments |
| Member search | ⚠️ Partial | Endpoint exists but untested for mentions |
| Screenshot storage | ⚠️ Partial | `screenshotUrl` field on thread, but no upload endpoint |
| Environment capture | ✅ Model exists | `Environment` table in Prisma, `ThreadsService.create` handles it |

---

## 5. Architecture Notes

### WP Plugin Architecture
- **Single 2998-line IIFE** (`frontend.js`) — all DOM manipulation, state, API calls
- **CSS** (`frontend.css`, 2547 lines) — all styling
- **Screenshot editor** (`screenshot-editor.js`) — standalone canvas editor
- **REST API** (PHP `RestController.php`) — WP REST routes under `/wpf/v1`
- **State**: Module-scoped variables (no framework)
- **Rendering**: Imperative DOM manipulation via `el()` helper

### SaaS Architecture
- **React/Next.js** with functional components and hooks
- **Single 842-line page component** — all workspace logic in one file
- **Tailwind CSS** for styling
- **API**: NestJS backend with Prisma ORM
- **State**: React useState/useCallback (no external state management)

### Key Architectural Difference
The WP plugin uses an **inverted interaction model**:
- Default: overlay captures clicks for pin placement ("comment mode")
- Toggle: "interact mode" lets clicks pass through to page

The SaaS workspace uses:
- Default: overlay is `pointer-events:none` (scroll/interact through)
- Toggle: "pin mode" enables overlay click capture

This is a deliberate design choice for the SaaS context (users browse the iframe primarily, pin placement is secondary).

---

*End of Audit Report. See IMPLEMENTATION_PLAN.md for the task breakdown.*
