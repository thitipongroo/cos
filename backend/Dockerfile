# Construction OS — Backend NestJS Monolith
# Multi-stage build: builder → runner (non-root, minimal image)

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
WORKDIR /app

# ─── Stage 1: Dependencies ────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY backend/package.json ./backend/
COPY packages/@cos/shared/package.json ./packages/@cos/shared/
COPY packages/@cos/rbac/package.json ./packages/@cos/rbac/
COPY packages/@cos/logger/package.json ./packages/@cos/logger/
COPY packages/@cos/tracing/package.json ./packages/@cos/tracing/
COPY packages/@cos/financial/package.json ./packages/@cos/financial/
COPY packages/@cos/types/package.json ./packages/@cos/types/
COPY packages/@cos/config/package.json ./packages/@cos/config/
COPY packages/@cos/validation/package.json ./packages/@cos/validation/
COPY packages/@cos/database/package.json ./packages/@cos/database/
COPY packages/@cos/extension-points/package.json ./packages/@cos/extension-points/
RUN pnpm install --frozen-lockfile --filter @cos/backend...

# ─── Stage 2: Builder ─────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY . .
RUN pnpm --filter @cos/backend build

# ─── Stage 3: Runner (production image) ───────────────────────────────────
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# Non-root user — QM-4 security hardening
RUN addgroup --system --gid 1001 cosgroup && \
    adduser --system --uid 1001 --ingroup cosgroup cosuser

WORKDIR /app
COPY --from=builder --chown=cosuser:cosgroup /app/backend/dist ./dist
COPY --from=builder --chown=cosuser:cosgroup /app/backend/node_modules ./node_modules
COPY --from=builder --chown=cosuser:cosgroup /app/backend/prisma ./prisma

USER cosuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health/live || exit 1

CMD ["node", "dist/main"]
