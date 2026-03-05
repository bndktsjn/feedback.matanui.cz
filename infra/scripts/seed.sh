#!/bin/bash
set -e
echo "Seeding database..."
pnpm --filter @feedback/db run db:seed
echo "Seeding complete."
