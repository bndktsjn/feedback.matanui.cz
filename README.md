# Feedback App

Visual feedback and annotation tool for websites. Multi-tenant SaaS application.

## Prerequisites

- **Node.js** >= 20 LTS
- **pnpm** >= 9 (`corepack enable && corepack prepare pnpm@9.15.4 --activate`)
- **Docker** + Docker Compose (for Postgres, MinIO, and optional full-stack dev)

## Quick Start (local dev, services in Docker)

```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment
cp .env.example .env
# Edit .env if needed (defaults work for local dev)

# 3. Start Postgres + MinIO
docker compose -f infra/docker-compose.yml up postgres minio minio-init -d

# 4. Generate Prisma client + run migrations
pnpm --filter @feedback/db run db:generate
pnpm --filter @feedback/db run db:migrate:dev

# 5. Start dev servers
pnpm dev
# → API:  http://localhost:3001/api/v1/health
# → Web:  http://localhost:3000
```

## Quick Start (full Docker Compose)

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up --build -d
docker compose exec api sh -c "pnpm --filter @feedback/db exec prisma migrate deploy"

# Verify
curl http://localhost:3001/api/v1/health
```

## Project Structure

```
├── apps/
│   ├── api/          # NestJS backend (TypeScript)
│   └── web/          # Next.js frontend (React, Tailwind, shadcn/ui)
├── packages/
│   ├── db/           # Prisma schema, migrations, client
│   ├── shared/       # Shared types, constants, validation schemas
│   └── eslint-config/# Shared ESLint configuration
├── infra/
│   ├── docker-compose.yml      # Postgres + MinIO
│   ├── docker-compose.dev.yml  # API + Web containers
│   ├── Caddyfile               # Reverse proxy config
│   ├── api.Dockerfile
│   └── web.Dockerfile
└── .github/workflows/ci.yml   # CI pipeline
```

## Key Commands

| Command                                         | Description                       |
| ----------------------------------------------- | --------------------------------- |
| `pnpm dev`                                      | Start all dev servers (Turborepo) |
| `pnpm build`                                    | Build all packages and apps       |
| `pnpm lint`                                     | Lint all workspaces               |
| `pnpm typecheck`                                | Type-check all workspaces         |
| `pnpm test`                                     | Run tests                         |
| `pnpm --filter @feedback/db run db:studio`      | Open Prisma Studio                |
| `pnpm --filter @feedback/db run db:migrate:dev` | Create/apply migration            |

## Deploy to VPS

```bash
# Option A: One-command deploy (from local machine)
# Edit .env with production values first, then:
./deploy.sh

# Option B: Manual deploy on VPS (100.97.158.52)
git clone <repo-url> /opt/feedback-app && cd /opt/feedback-app
cp .env.example .env
# Edit .env with production values:
#   - Strong SESSION_SECRET and CSRF_SECRET
#   - Strong POSTGRES_PASSWORD, S3_ACCESS_KEY, S3_SECRET_KEY
#   - SMTP settings for email

# Start all services (Postgres, MinIO, API, Web, Caddy with auto-TLS)
docker compose -f infra/docker-compose.prod.yml up --build -d

# Run migrations
docker compose -f infra/docker-compose.prod.yml exec api \
  npx prisma migrate deploy --schema=/app/packages/db/prisma/schema.prisma

# Verify
curl https://feedback.matanui.cz/api/v1/health
```

## Architecture

See [ARCHITECTURE_PLAN.md](./ARCHITECTURE_PLAN.md) for the full architecture decision document, domain model, API design, and migration roadmap.
