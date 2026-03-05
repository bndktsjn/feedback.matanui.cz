#!/bin/bash
set -e
echo "Running Prisma migrations..."
pnpm --filter @feedback/db exec prisma migrate deploy
echo "Migrations complete."
