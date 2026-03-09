FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/eslint-config/package.json ./packages/eslint-config/
RUN pnpm install --no-frozen-lockfile

# Generate Prisma client
FROM deps AS prisma
COPY packages/db/prisma ./packages/db/prisma
RUN pnpm --filter @feedback/db exec prisma generate

# Build
FROM prisma AS build
ARG CACHEBUST=1
COPY packages/shared ./packages/shared
COPY packages/db/src ./packages/db/src
COPY packages/db/tsconfig.json ./packages/db/
RUN pnpm --filter @feedback/db run build
COPY apps/api ./apps/api
RUN rm -rf apps/api/dist apps/api/tsconfig.tsbuildinfo apps/api/tsconfig.build.tsbuildinfo \
    && pnpm --filter @feedback/api run build \
    && ls apps/api/dist/main.js

# Production
FROM base AS runner
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/public ./apps/api/public
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/package.json ./

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
