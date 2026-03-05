#!/bin/bash
set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
REMOTE_USER="benedikt"
REMOTE_HOST="100.97.158.52"
REMOTE_DIR="/var/www/feedback.matanui.cz/public_html"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[DEPLOY]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ─── Pre-flight checks ───────────────────────────────────────────────────────
info "Running pre-flight checks..."

if [ ! -f "$PROJECT_DIR/.env" ]; then
  error "Missing .env file. Run: cp .env.example .env and fill in production values."
fi

if ! command -v rsync &>/dev/null; then
  error "rsync is not installed."
fi

if ! ssh -q -o ConnectTimeout=5 "${REMOTE_USER}@${REMOTE_HOST}" exit 2>/dev/null; then
  error "Cannot connect to ${REMOTE_USER}@${REMOTE_HOST}. Check SSH access."
fi

# ─── Sync project to remote ──────────────────────────────────────────────────
info "Syncing project to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}..."

rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude '.turbo' \
  --exclude '.git' \
  --exclude '.env' \
  "$PROJECT_DIR/" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

# ─── Copy .env separately (won't be deleted on re-deploy) ────────────────────
info "Syncing .env to remote (no --delete)..."
rsync -avz "$PROJECT_DIR/.env" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/.env"

# ─── Run migrations + start services on remote ───────────────────────────────
info "Building and starting services on remote..."

ssh "${REMOTE_USER}@${REMOTE_HOST}" bash -s <<ENDSSH
  set -euo pipefail
  cd "${REMOTE_DIR}"

  echo ">>> Pulling images & building containers..."
  docker compose --env-file .env -f infra/docker-compose.prod.yml up --build -d

  echo ">>> Waiting for Postgres to be healthy..."
  sleep 5

  echo ">>> Running Prisma migrations..."
  docker compose --env-file .env -f infra/docker-compose.prod.yml exec api \
    node -e "
      const { execSync } = require('child_process');
      execSync('npx prisma migrate deploy --schema=/app/packages/db/prisma/schema.prisma', { stdio: 'inherit' });
    "

  echo ">>> Services status:"
  docker compose --env-file .env -f infra/docker-compose.prod.yml ps
ENDSSH

# ─── Verify ──────────────────────────────────────────────────────────────────
info "Deployment complete!"
echo ""
info "Verify with:"
echo "  curl -s https://feedback.matanui.cz/api/v1/health | jq"
echo "  curl -s -o /dev/null -w '%{http_code}' https://feedback.matanui.cz/"
echo ""
