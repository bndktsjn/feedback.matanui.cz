# Feedback SaaS — Architecture & Roadmap (v2)

> Generated: 2025-02-22 | Revised with clarifying answers
> Status: **APPROVED DIRECTION — Phase 0 ready to execute**

---

## Locked Decisions

| Decision           | Choice                                                                             |
| ------------------ | ---------------------------------------------------------------------------------- |
| **Hosting**        | Self-hosted VPS (Docker Compose + Caddy). 12-factor design for future migration.   |
| **Domain**         | Single domain `feedback.matanui.cz` with `/api` prefix (same-origin)               |
| **Backend**        | Node.js + NestJS (TypeScript)                                                      |
| **Database**       | PostgreSQL 16                                                                      |
| **ORM**            | Prisma (schema-first, typed client, migrations)                                    |
| **Frontend**       | Next.js 14+ (App Router), React 18, TypeScript                                     |
| **Styling**        | Tailwind CSS + shadcn/ui                                                           |
| **Auth**           | Self-managed: email+password, bcrypt, httpOnly session cookies, CSRF double-submit |
| **File storage**   | S3-compatible (MinIO local, S3/R2 later)                                           |
| **Monorepo**       | Turborepo + pnpm workspaces                                                        |
| **Overlay**        | Script-inject first (reuse WP JS), iframe workspace as fallback                    |
| **Billing entity** | `organizations` table from day 1 (schema only, no billing logic in MVP)            |
| **Data migration** | None — feature parity only, empty DB                                               |
| **Notifications**  | Transactional email only (verification + reset)                                    |
| **Real-time**      | Polling/refresh for MVP. Clean service layer for future SSE/WS.                    |

---

## 0. Existing Plugin Audit Summary

### Capabilities being ported

| Category    | Feature                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data**    | Threads (status, priority, type, pins, viewport, env), replies, mentions, attachments                                                             |
| **API**     | Full CRUD: threads, replies, users, attachments under `wpf/v1`                                                                                    |
| **Overlay** | Pin mode, panel mode, toolbar, thread sidebar, @mentions, file upload, screenshot capture+editor, device preview, deep links, environment capture |
| **Admin**   | Thread list (columns, filters), settings (enable, roles, env mode)                                                                                |

### Gaps (new in SaaS)

- Organizations → Projects hierarchy
- Standalone auth
- Tasks / Kanban
- Team/member management
- URL allow-listing per project

---

## A. Architecture Decisions

### A.1 Deployment topology

```
Internet ──► Caddy (TLS, reverse proxy)
               /api/*  ──► NestJS (:3001)
               /*      ──► Next.js (:3000)
             + Postgres (:5432) + MinIO (:9000)
```

All in Docker Compose. Same-origin = no CORS, first-party cookies, simple CSRF.

### A.2 Auth strategy

- bcrypt cost 12, session in PG `sessions` table
- Cookie: `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`
- CSRF: double-submit cookie (server sets `csrf_token` cookie, frontend sends `X-CSRF-Token` header)
- Lockout: 10 failures → 15-min cooldown
- Transactional email via Nodemailer+SMTP (verification + reset only)

### A.3 Multi-tenant: Org → Project

```
Organization (billing entity, plan, stripe_customer_id nullable)
  └─ OrgMember (user + org role: owner/admin/member)
       └─ Project (one client website)
            └─ ProjectMember (user + project role: admin/member/viewer)
                 └─ Threads, Tasks, etc.
```

Every data query scopes through `project_id`. `TenantGuard` verifies org + project membership.

### A.4 Overlay: script-inject first

- Primary: `<script src="feedback.matanui.cz/embed/PROJ_ID.js">` — injects overlay via Shadow DOM
- Reuses existing `frontend.js`, progressively refactored to TS
- Auth on customer sites: popup flow → token via `postMessage`
- Secondary: iframe workspace at `/p/:slug/workspace?url=...` with fallback banner

---

## B. Domain Model & DB Schema

### B.1 ER Overview

```
User ──< OrgMember >── Organization ──< Project ──< ProjectMember >── User
                                          │
                                          ├──< AllowedUrlRule
                                          ├──< Thread ──< Comment
                                          │       ├──< Attachment/Mention (poly)
                                          │       └── ThreadEnvironment (1:1)
                                          ├──< KanbanColumn
                                          └──< Task ──< TaskHistory
```

### B.2 Tables (key changes from v1: `organizations` + `organization_members` added)

```sql
-- USERS
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(512),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification_token VARCHAR(255),
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMPTZ,
    failed_login_count INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- SESSIONS
CREATE TABLE sessions (
    id VARCHAR(128) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ORGANIZATIONS (billing entity)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    billing_email VARCHAR(255),
    plan VARCHAR(50) NOT NULL DEFAULT 'free',
    stripe_customer_id VARCHAR(255),
    settings JSONB NOT NULL DEFAULT '{}',
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ORG MEMBERS
CREATE TYPE org_role AS ENUM ('owner', 'admin', 'member');
CREATE TABLE organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role org_role NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, user_id)
);

-- PROJECTS
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    base_url VARCHAR(512) NOT NULL,
    description TEXT,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (org_id, slug)
);

-- PROJECT MEMBERS
CREATE TYPE project_role AS ENUM ('admin', 'member', 'viewer');
CREATE TABLE project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role project_role NOT NULL DEFAULT 'member',
    invited_by UUID REFERENCES users(id),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, user_id)
);

-- ALLOWED URL RULES
CREATE TABLE allowed_url_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    pattern VARCHAR(512) NOT NULL,
    rule_type VARCHAR(20) NOT NULL DEFAULT 'glob',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- THREADS
CREATE TYPE thread_status AS ENUM ('open','in_progress','resolved','closed');
CREATE TYPE thread_priority AS ENUM ('low','medium','high','critical');
CREATE TYPE thread_type AS ENUM ('general','bug','design','content');
CREATE TYPE context_type AS ENUM ('pin','panel');
CREATE TYPE viewport_type AS ENUM ('desktop','tablet','mobile');

CREATE TABLE threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    page_url VARCHAR(2048) NOT NULL,
    page_title VARCHAR(512),
    status thread_status NOT NULL DEFAULT 'open',
    priority thread_priority NOT NULL DEFAULT 'medium',
    type thread_type NOT NULL DEFAULT 'general',
    context_type context_type NOT NULL DEFAULT 'panel',
    viewport viewport_type NOT NULL DEFAULT 'desktop',
    x_pct NUMERIC(7,4),
    y_pct NUMERIC(7,4),
    anchor_data JSONB,
    target_selector VARCHAR(512),
    screenshot_url VARCHAR(512),
    created_via VARCHAR(20) NOT NULL DEFAULT 'overlay',
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_threads_project ON threads (project_id);
CREATE INDEX idx_threads_project_status ON threads (project_id, status);

-- THREAD ENVIRONMENTS (1:1)
CREATE TABLE thread_environments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL UNIQUE REFERENCES threads(id) ON DELETE CASCADE,
    browser_name VARCHAR(100), browser_version VARCHAR(50),
    os_name VARCHAR(100), os_version VARCHAR(50),
    viewport_mode VARCHAR(20),
    viewport_width INT, viewport_height INT,
    device_pixel_ratio NUMERIC(4,2),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- COMMENTS
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- MENTIONS (polymorphic)
CREATE TABLE mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentionable_type VARCHAR(20) NOT NULL,
    mentionable_id UUID NOT NULL,
    mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ATTACHMENTS (polymorphic)
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attachable_type VARCHAR(20) NOT NULL,
    attachable_id UUID NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    filename VARCHAR(255) NOT NULL,
    storage_key VARCHAR(512) NOT NULL,
    url VARCHAR(512) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- KANBAN COLUMNS
CREATE TABLE kanban_columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    position INT NOT NULL DEFAULT 0,
    color VARCHAR(7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TASKS
CREATE TYPE task_status AS ENUM ('todo','in_progress','done','cancelled');
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    thread_id UUID REFERENCES threads(id) ON DELETE SET NULL,
    kanban_column_id UUID REFERENCES kanban_columns(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status task_status NOT NULL DEFAULT 'todo',
    priority thread_priority NOT NULL DEFAULT 'medium',
    assignee_id UUID REFERENCES users(id),
    position INT NOT NULL DEFAULT 0,
    due_date DATE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- TASK HISTORY
CREATE TABLE task_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    changed_by UUID NOT NULL REFERENCES users(id),
    field VARCHAR(50) NOT NULL,
    old_value TEXT, new_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### B.3 Deletion strategy

- **Soft delete** (`deleted_at`): users, organizations, projects, threads, comments, tasks
- **Hard delete**: sessions, mentions, org/project members, attachments (+ S3 lifecycle 30d)

---

## C. API Design

### C.1 Conventions

- Base: `/api/v1` | Auth: httpOnly session cookie | CSRF: `X-CSRF-Token` on mutations
- Errors: `{ "error": { "code": "...", "message": "...", "status": 404 } }`
- Pagination: `?page=1&per_page=20` → `X-Total-Count` header

### C.2 Routes summary

```
Auth:     POST /api/v1/auth/{register,login,logout,forgot-password,reset-password,verify-email}
          GET|PATCH /api/v1/auth/me

Orgs:     GET|POST /api/v1/orgs
          GET|PATCH|DELETE /api/v1/orgs/:orgId
          CRUD /api/v1/orgs/:orgId/members

Projects: GET|POST /api/v1/orgs/:orgId/projects
          GET|PATCH|DELETE /api/v1/orgs/:orgId/projects/:projectId
          CRUD /api/v1/orgs/:orgId/projects/:projectId/{members,url-rules}

Threads:  GET|POST /api/v1/projects/:projectId/threads
          GET|PATCH|DELETE /api/v1/projects/:projectId/threads/:threadId

Comments: CRUD /api/v1/projects/:pId/threads/:tId/comments

Tasks:    CRUD /api/v1/projects/:pId/tasks
Kanban:   CRUD /api/v1/projects/:pId/kanban-columns
Files:    POST /api/v1/projects/:pId/attachments
Users:    GET  /api/v1/projects/:pId/users?search=
```

Thread routes use `/projects/:projectId` directly (shorter). TenantGuard resolves org from project.

### C.3 Permissions

| Role (project) | Threads           | Comments          | Tasks                  | Members |
| -------------- | ----------------- | ----------------- | ---------------------- | ------- |
| **admin**      | CRUD all          | CRUD all          | CRUD all               | manage  |
| **member**     | Create + edit own | Create + edit own | Create + edit assigned | read    |
| **viewer**     | Read              | Read              | Read                   | read    |

Org `owner`/`admin` → implicit project admin.

---

## D. Frontend IA

```
Public: /, /login, /register, /forgot-password, /reset-password, /verify-email

App:
  /orgs, /orgs/new
  /o/:orgSlug/settings, /o/:orgSlug/projects, /o/:orgSlug/projects/new
  /p/:projectSlug/threads (+ drawer), /p/:projectSlug/tasks, /p/:projectSlug/kanban
  /p/:projectSlug/workspace?url=..., /p/:projectSlug/settings

Account: /account, /account/security
```

Key screens: org/project list (cards), thread list (table+drawer), task list, kanban board (drag-drop), feedback workspace (iframe+overlay), project settings (URL rules, members).

---

## E. Feature Parity Checklist

### E.1 Overlay (Phase 2)

| #   | Behavior                     | Module               |
| --- | ---------------------------- | -------------------- |
| 1   | Overlay toolbar              | `packages/embed`     |
| 2   | Pin mode (x/y %)             | `packages/embed`     |
| 3   | Panel mode (no pin)          | `packages/embed`     |
| 4   | Thread sidebar (list+filter) | `packages/embed`     |
| 5   | Thread detail (replies)      | `packages/embed`     |
| 6   | @mention autocomplete        | `packages/embed`     |
| 7   | File attachments             | `packages/embed`     |
| 8   | Screenshot capture           | `packages/embed`     |
| 9   | Screenshot editor            | `packages/embed`     |
| 10  | Viewport preview             | `apps/web` workspace |
| 11  | Deep linking                 | `packages/embed`     |
| 12  | iframe embed support         | `apps/web` workspace |

### E.2 Data/API (Phase 1)

| #   | Behavior                         | Module                       |
| --- | -------------------------------- | ---------------------------- |
| 13  | Thread CRUD (all fields)         | `apps/api` ThreadsModule     |
| 14  | Thread statuses/priorities/types | `apps/api` ThreadsModule     |
| 15  | Reply CRUD                       | `apps/api` CommentsModule    |
| 16  | Mentions per thread/comment      | `apps/api` MentionsService   |
| 17  | Attachments per thread/comment   | `apps/api` AttachmentsModule |
| 18  | Thread list with filters         | `apps/web` ThreadListPage    |
| 19  | Thread detail drawer             | `apps/web` ThreadDrawer      |
| 20  | User search for @mentions        | `apps/api` UsersModule       |

### E.3 Environment (Phase 4)

| #   | Behavior                                | Module                  |
| --- | --------------------------------------- | ----------------------- |
| 21  | Env capture (browser, OS, viewport, UA) | `packages/embed`        |
| 22  | Env popover in thread "…" menu          | `apps/web` ThreadDrawer |

### E.4 New (not in WP plugin)

| #   | Feature                      | Phase |
| --- | ---------------------------- | ----- |
| 23  | Organizations                | 1     |
| 24  | Auth (register/verify/reset) | 1     |
| 25  | Project + member management  | 1     |
| 26  | URL allow-listing            | 1     |
| 27  | Tasks + Kanban               | 3     |
| 28  | Convert thread → task        | 3     |

---

## F. Roadmap

| Phase | Scope                                           | Weeks | Effort |
| ----- | ----------------------------------------------- | ----- | ------ |
| **0** | Foundation: repo, Docker, DB, CI, deploy        | 1–2   | 8–10d  |
| **1** | Auth + Orgs + Projects + Thread CRUD + basic UI | 3–5   | 14–18d |
| **2** | Overlay embed + workspace + screenshots         | 6–9   | 16–20d |
| **3** | Tasks + Kanban                                  | 10–12 | 10–14d |
| **4** | Environment metadata + polish                   | 13–14 | 5–7d   |
| **5** | Hardening: rate limits, audit, backups, CSP     | 15–17 | 10–14d |

---

## G. Security Checklist

- [ ] `WHERE project_id = ?` in every query (repository base class)
- [ ] TenantGuard: org + project membership before handler
- [ ] Cross-project access tests → 403/404
- [ ] bcrypt cost 12, session in PG, httpOnly/Secure/SameSite=Lax cookie
- [ ] CSRF double-submit for mutations
- [ ] Lockout: 10 failures → 15-min
- [ ] Zod validation on all inputs, DOMPurify on render
- [ ] File upload: 10MB max, MIME whitelist, magic bytes, UUID keys
- [ ] Structured JSON logs (pino), no PII in logs
- [ ] `.env` in `.gitignore`, secrets in Docker env

---

## H. Iframe / Overlay Strategy

**Primary — Script-Inject:** `<script src="feedback.matanui.cz/embed/PROJ_ID.js">` → Shadow DOM overlay on customer site. Auth via popup + postMessage token. Reuses existing `frontend.js`, progressively refactored.

**Secondary — Iframe Workspace:** `/p/:slug/workspace?url=...`. Fallback banner + "Copy snippet" when blocked. Detection: onload + 5s timeout.

**Future — Proxy (Phase 6+):** Server-side fetch + strip frame headers. Deferred (SSRF risk, complexity).

---

## I. Phase 0 — Concrete First Step

### I.1 Exact repo structure

```
feedback-app/
├── apps/
│   ├── api/                          # NestJS backend
│   │   ├── src/
│   │   │   ├── main.ts              # Bootstrap, global prefix /api, listen :3001
│   │   │   ├── app.module.ts        # Root module, imports PrismaModule + HealthModule
│   │   │   ├── health/
│   │   │   │   ├── health.controller.ts   # GET /api/v1/health → { status, timestamp, db }
│   │   │   │   └── health.module.ts
│   │   │   ├── prisma/
│   │   │   │   ├── prisma.service.ts      # Wraps PrismaClient, onModuleInit/Destroy
│   │   │   │   └── prisma.module.ts       # Global module, exports PrismaService
│   │   │   └── common/
│   │   │       └── filters/
│   │   │           └── http-exception.filter.ts  # Consistent error shape
│   │   ├── test/
│   │   │   └── health.e2e-spec.ts
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   └── package.json
│   └── web/                          # Next.js frontend
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx        # Root layout (html, body, Tailwind)
│       │   │   └── page.tsx          # Placeholder landing: "Feedback App — Coming Soon"
│       │   └── styles/
│       │       └── globals.css       # @tailwind base/components/utilities
│       ├── public/
│       │   └── favicon.ico
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       ├── next.config.ts            # rewrites: /api/** → http://localhost:3001/api/**
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   ├── db/                           # Prisma schema + migrations
│   │   ├── prisma/
│   │   │   └── schema.prisma        # Full schema from Section B.2
│   │   ├── seed.ts                   # Empty seed placeholder
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── shared/                       # Shared types, constants (grows over time)
│   │   ├── src/
│   │   │   └── index.ts             # Re-export placeholder
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── eslint-config/
│       ├── base.js                   # TS + Prettier rules
│       └── package.json
├── infra/
│   ├── docker-compose.yml            # Services: postgres, minio, api, web
│   ├── docker-compose.dev.yml        # Dev overrides (volumes, hot reload)
│   ├── Caddyfile                     # feedback.matanui.cz: /api/* → api:3001, /* → web:3000
│   ├── api.Dockerfile                # Multi-stage: install → build → run
│   ├── web.Dockerfile                # Multi-stage: install → build → run
│   └── scripts/
│       ├── migrate.sh                # #!/bin/bash — pnpm --filter db prisma migrate deploy
│       └── seed.sh                   # #!/bin/bash — pnpm --filter db prisma db seed
├── .github/
│   └── workflows/
│       └── ci.yml                    # lint → typecheck → test → build (on push to main + PRs)
├── .env.example                      # Documented env vars
├── .gitignore                        # node_modules, .env, dist, .next, .turbo
├── turbo.json                        # Pipeline: build, lint, typecheck, test, dev
├── package.json                      # pnpm workspaces root, shared scripts
├── pnpm-workspace.yaml               # packages: ["apps/*", "packages/*"]
└── README.md                         # Setup + deploy runbook
```

### I.2 Decisions locked before coding

These must not change during Phase 0 implementation:

1. **Node 20 LTS** — base image for Docker, engines field in package.json
2. **pnpm 9** — package manager, lockfile committed
3. **NestJS 10** — latest stable
4. **Next.js 14** — App Router
5. **Prisma 5** — schema in `packages/db/prisma/schema.prisma`
6. **PostgreSQL 16** — Docker image `postgres:16-alpine`
7. **MinIO** — S3-compatible local storage, image `minio/minio`
8. **Caddy 2** — reverse proxy + auto TLS, image `caddy:2-alpine`
9. **Session cookie name:** `feedback_sid`
10. **API global prefix:** `/api`, versioned routes: `/api/v1/*`
11. **Prisma provider:** `postgresql`, connection via `DATABASE_URL` env var

### I.3 Ordered tasks with acceptance criteria

#### Task 0.1 — Initialize monorepo root

Create `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.env.example`.

**AC:**

- `pnpm install` succeeds (no workspaces yet, just root)
- `turbo.json` defines `build`, `dev`, `lint`, `typecheck`, `test` pipelines

---

#### Task 0.2 — Create `packages/db` with Prisma schema

Create `packages/db/package.json`, `prisma/schema.prisma` (full schema from Section B.2), `seed.ts` (placeholder).

**AC:**

- `pnpm --filter @feedback/db exec prisma validate` passes
- `pnpm --filter @feedback/db exec prisma generate` produces typed client
- Schema contains all 15 tables: users, sessions, organizations, organization_members, projects, project_members, allowed_url_rules, threads, thread_environments, comments, mentions, attachments, kanban_columns, tasks, task_history

---

#### Task 0.3 — Create `packages/shared` and `packages/eslint-config`

- `packages/shared`: placeholder `src/index.ts`, `tsconfig.json`, `package.json` (name: `@feedback/shared`)
- `packages/eslint-config`: `base.js` with TypeScript + Prettier rules, `package.json`

**AC:**

- `pnpm --filter @feedback/shared build` produces output
- ESLint config importable from apps

---

#### Task 0.4 — Scaffold `apps/api` (NestJS)

Minimal NestJS app:

- `main.ts`: bootstrap, global prefix `/api`, listen `:3001`
- `PrismaModule` (global): wraps `@feedback/db` PrismaClient
- `HealthModule`: `GET /api/v1/health` → `{ "status": "ok", "timestamp": "...", "db": true/false }`
- `HttpExceptionFilter`: consistent error response shape
- `health.e2e-spec.ts`: test health endpoint returns 200

**AC:**

- `pnpm --filter api dev` starts on port 3001
- `curl http://localhost:3001/api/v1/health` → 200 with JSON body
- `pnpm --filter api test:e2e` passes

---

#### Task 0.5 — Scaffold `apps/web` (Next.js)

Minimal Next.js 14 app:

- App Router: `layout.tsx` + `page.tsx` (placeholder landing)
- Tailwind CSS configured
- `next.config.ts`: rewrites `/api/:path*` → `http://localhost:3001/api/:path*` (dev only)

**AC:**

- `pnpm --filter web dev` starts on port 3000
- `http://localhost:3000` renders placeholder page
- `http://localhost:3000/api/v1/health` proxies to NestJS and returns health JSON
- Tailwind classes work

---

#### Task 0.6 — Docker Compose (dev)

Create `infra/docker-compose.yml` + `infra/docker-compose.dev.yml`:

- `postgres`: image `postgres:16-alpine`, port 5432, volume for data
- `minio`: image `minio/minio`, port 9000/9001, default bucket `feedback-uploads`
- `api`: builds from `infra/api.Dockerfile`, depends on postgres, env from `.env`
- `web`: builds from `infra/web.Dockerfile`, depends on api

Create `infra/api.Dockerfile` and `infra/web.Dockerfile` (multi-stage builds).

**AC:**

- `docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up --build` starts all services
- Postgres accepts connections on 5432
- MinIO console accessible on 9001
- API health check responds via Docker network

---

#### Task 0.7 — Prisma migrations

Run initial migration from schema.

**AC:**

- `pnpm --filter @feedback/db exec prisma migrate dev --name init` creates migration files
- Migration applies cleanly to empty Postgres (via Docker)
- All 15 tables exist in DB (verified via `psql` or Prisma Studio)

---

#### Task 0.8 — Caddy reverse proxy config

Create `infra/Caddyfile`:

- Local dev: `localhost:8080` (or configurable)
- Production: `feedback.matanui.cz` with auto TLS
- `/api/*` → `api:3001`
- `/*` → `web:3000`

**AC:**

- With Caddy in Docker Compose, `http://localhost:8080/api/v1/health` returns health JSON
- `http://localhost:8080/` returns Next.js page
- Single domain, both services accessible

---

#### Task 0.9 — CI pipeline

Create `.github/workflows/ci.yml`:

- Triggers on push to `main` and PRs
- Steps: checkout → pnpm install → lint → typecheck → test → build
- Uses PostgreSQL service container for e2e tests

**AC:**

- Pipeline runs successfully on GitHub Actions (or can be tested locally with `act`)
- All steps pass on clean checkout

---

#### Task 0.10 — README + .env.example + deploy runbook

- `README.md`: prerequisites (Node 20, pnpm 9, Docker), quick start, project structure overview
- `.env.example`: all env vars with descriptions and example values
- Deploy section in README: how to deploy to VPS (clone, `.env`, docker compose up)

**AC:**

- A new contributor can clone the repo, copy `.env.example` → `.env`, run `docker compose up`, and hit the health endpoint within 5 minutes

---

### I.4 Bootstrap commands (local dev without Docker)

```bash
# 1. Clone and install
git clone <repo-url> feedback-app && cd feedback-app
pnpm install

# 2. Set up environment
cp .env.example .env
# Edit .env: set DATABASE_URL=postgresql://feedback:feedback@localhost:5432/feedback

# 3. Start Postgres + MinIO (Docker, just the infra services)
docker compose -f infra/docker-compose.yml up postgres minio -d

# 4. Run migrations
pnpm --filter @feedback/db exec prisma migrate dev

# 5. Generate Prisma client
pnpm --filter @feedback/db exec prisma generate

# 6. Start dev servers (in parallel via Turborepo)
pnpm dev
# → API on http://localhost:3001/api/v1/health
# → Web on http://localhost:3000

# 7. Verify
curl http://localhost:3001/api/v1/health
# {"status":"ok","timestamp":"2025-02-22T16:00:00.000Z","db":true}
```

### I.5 Bootstrap commands (full Docker Compose)

```bash
# 1. Clone and configure
git clone <repo-url> feedback-app && cd feedback-app
cp .env.example .env

# 2. Build and start everything
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up --build

# 3. Run migrations (in separate terminal)
docker compose exec api sh -c "pnpm --filter @feedback/db exec prisma migrate deploy"

# 4. Verify
curl http://localhost:8080/api/v1/health
curl http://localhost:8080/
```

### I.6 .env.example contents

```env
# Database
DATABASE_URL=postgresql://feedback:feedback@localhost:5432/feedback
POSTGRES_USER=feedback
POSTGRES_PASSWORD=feedback
POSTGRES_DB=feedback

# Session
SESSION_SECRET=change-me-to-a-random-64-char-string
SESSION_MAX_AGE_MS=86400000

# MinIO / S3
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=feedback-uploads
S3_REGION=us-east-1

# Email (SMTP)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@feedback.matanui.cz

# App
NODE_ENV=development
API_PORT=3001
WEB_PORT=3000
APP_URL=http://localhost:3000

# CSRF
CSRF_SECRET=change-me-to-a-random-32-char-string
```

---

_End of architecture plan. Phase 0 is ready to execute. No code until you confirm._
