# Construction OS — Backend NestJS Monolith
# Multi-stage build: builder → runner (non-root, minimal image)

FROM node:24-alpine AS base
# Prisma selects its query-engine by probing `openssl version`. node:*-alpine ships libssl.so.3
# but NOT the openssl CLI, so Prisma falls back to the openssl-1.1.x engine (→ "libssl.so.1.1: not
# found" at runtime). Installing the openssl package makes Prisma detect 3.0.x and use that engine.
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app
# Run pnpm non-interactively (same as GitHub Actions). Without this, pnpm 11's pre-run
# deps-status check aborts on a TTY prompt when it wants to purge the modules dir
# (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY).
ENV CI=true

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
COPY packages/@cos/test-utils/package.json ./packages/@cos/test-utils/
RUN pnpm install --frozen-lockfile --filter @cos/backend...

# ─── Stage 2: Builder ─────────────────────────────────────────────────────
FROM base AS builder
# Bring the full installed workspace from deps — including each packages/@cos/* package's own
# node_modules (their tsc/typescript), which a per-dir copy would miss. Then overlay source;
# .dockerignore excludes node_modules so the installed ones survive the COPY.
COPY --from=deps /app ./
COPY . .
# Generate the Prisma client before any TS build. Both @cos/database and backend re-export
# Prisma's generated types; without the generated client, tx/$queryRaw<T> degrade to `unknown`
# (TS18046 in workforce.repository.ts). Mirrors CI's "prisma generate" step that runs before build.
RUN pnpm --filter @cos/backend exec prisma generate
# Build backend AND its @cos/* workspace deps in topological order ("..."). backend/tsconfig.build.json
# clears `paths`, so `nest build` resolves @cos/* via node_modules → dist — those dists must exist
# first. On host/CI this ordering is handled by turbo (^build); here pnpm runs deps before dependents.
RUN pnpm --filter @cos/backend... --workspace-concurrency=1 build

# ─── Stage 3: Runner (production image) ───────────────────────────────────
FROM node:24-alpine AS runner
# openssl CLI + libssl.so.3 so Prisma's runtime engine probe resolves to openssl-3.0.x (see base stage).
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

# Non-root user — QM-4 security hardening
RUN addgroup --system --gid 1001 cosgroup && \
    adduser --system --uid 1001 --ingroup cosgroup cosuser

WORKDIR /app
# Copy the full built workspace, preserving the exact layout from the builder. pnpm's @cos/*
# entries are RELATIVE symlinks (backend/node_modules/@cos/* → ../../../packages/@cos/*) and the
# generated Prisma client lives in the hoisted root node_modules/.pnpm — moving node_modules to a
# shallower path breaks both. Keeping /app intact lets @cos/* and @prisma/client resolve at runtime.
COPY --from=builder --chown=cosuser:cosgroup /app ./

USER cosuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health/live || exit 1

CMD ["node", "backend/dist/main"]
