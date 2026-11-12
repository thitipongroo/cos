# Construction OS — Backend NestJS Monolith
# Multi-stage build: manifests → deps → builder; manifests → prod-deps; → runner (non-root, production files only)
#
# Debian (node:24-slim), not Alpine, since 2026-11-12 (D40): @temporalio/core-bridge ships glibc builds
# only (checked up to 1.25.0), so on musl the Temporal worker this image also runs
# (`node backend/dist/workers/main`, the cos-temporal-worker chart) exited at once with
# `__register_atfork: symbol not found`; gcompat does not fix it. Every stage moves, because native
# packages pick their libc build at install time (e.g. @swc/core, used by Temporal's workflow bundler).

FROM node:24-slim AS base
# openssl (CLI + libssl.so.3; node:24-slim ships neither) is installed as the Alpine stages installed
# it, for Prisma's openssl probe. The client generated here (Prisma 7, pg driver adapter) runs the wasm
# query compiler and carries no native engine on either base (measured 2026-11-12), so the runtime does
# not depend on it; it is kept rather than removed untested.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# pnpm comes from package.json's packageManager (version + sha512): Corepack downloads it on first use
# and refuses a tarball whose hash differs. Do not name a version here: one source keeps CI, Docker and
# dev machines on the same pnpm.
RUN corepack enable
WORKDIR /app
# Run pnpm non-interactively (same as GitHub Actions). Without this, pnpm 11's pre-run
# deps-status check aborts on a TTY prompt when it wants to purge the modules dir
# (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY).
ENV CI=true

# ─── Stage 1: Manifests (shared by both installs) ─────────────────────────
FROM base AS manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY backend/package.json ./backend/
COPY packages/@cos/shared/package.json ./packages/@cos/shared/
COPY packages/@cos/rbac/package.json ./packages/@cos/rbac/
COPY packages/@cos/logger/package.json ./packages/@cos/logger/
COPY packages/@cos/tracing/package.json ./packages/@cos/tracing/
COPY packages/@cos/financial/package.json ./packages/@cos/financial/
# @cos/kafka is a backend dependency (21 requires in backend/dist). Its manifest was missing here
# until 2026-11-12; pnpm still linked it from the lockfile's importer, but without its package.json.
COPY packages/@cos/kafka/package.json ./packages/@cos/kafka/
COPY packages/@cos/types/package.json ./packages/@cos/types/
COPY packages/@cos/config/package.json ./packages/@cos/config/
COPY packages/@cos/validation/package.json ./packages/@cos/validation/
COPY packages/@cos/database/package.json ./packages/@cos/database/
COPY packages/@cos/test-utils/package.json ./packages/@cos/test-utils/

# ─── Stage 2: Dependencies (all, to build) ────────────────────────────────
FROM manifests AS deps
RUN pnpm install --frozen-lockfile --filter @cos/backend...

# ─── Stage 3: Builder ─────────────────────────────────────────────────────
FROM base AS builder
# Bring the full installed workspace from deps — including each packages/@cos/* package's own
# node_modules (their tsc/typescript), which a per-dir copy would miss. Then overlay source;
# .dockerignore excludes node_modules so the installed ones survive the COPY.
COPY --from=deps /app ./
COPY . .
# Generate the Prisma client before any TS build. Both @cos/database and backend re-export
# Prisma's generated types; without the generated client, tx/$queryRaw<T> degrade to `unknown`
# (TS18046 in workforce.repository.ts). Mirrors CI's "prisma generate" step that runs before build.
# prisma.config.ts calls env('DIRECT_DATABASE_URL'), which throws (PrismaConfigEnvError) if unset —
# and .env is .dockerignore'd, so nothing sets it at build time. `generate` only reads the schema
# (it never connects), so a build-only placeholder satisfies the strict env() check. This ENV lives
# ONLY in the builder stage; the runner (its own FROM) gets the real value at runtime.
ENV DIRECT_DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN pnpm --filter @cos/backend exec prisma generate
# Build backend AND its @cos/* workspace deps in topological order ("..."). backend/tsconfig.build.json
# clears `paths`, so `nest build` resolves @cos/* via node_modules → dist — those dists must exist
# first. On host/CI this ordering is handled by turbo (^build); here pnpm runs deps before dependents.
RUN pnpm --filter @cos/backend... --workspace-concurrency=1 build

# ─── Stage 4: Production dependencies ─────────────────────────────────────
# A fresh install from the same manifests and lockfile, without devDependencies (root's jest,
# prettier, turbo, typescript, the prisma CLI, …). `pnpm install --prod` over the builder's
# node_modules does NOT do this: it removes nothing and re-runs @prisma/client's postinstall
# (measured 2026-11-12). The virtual-store paths come from the lockfile, so they match the builder's.
FROM manifests AS prod-deps
# `!@cos/test-utils`: backend's only workspace devDependency. `--filter @cos/backend...` still selects
# it under --prod, which installed its testcontainers / dockerode tree into the image (measured
# 2026-11-12).
# A shared pnpm store (a BuildKit cache mount for both installs) was tried and dropped (2026-11-12):
# from a store on another filesystem pnpm copies instead of hard-linking, so the second install took
# as long as downloading (~97 s against 91.5 s) and the image grew 63 MB (12,967 hard links lost).
RUN pnpm install --frozen-lockfile --prod --filter @cos/backend... --filter '!@cos/test-utils'
# Then the builder's output into this tree, each at the path it had there:
#  - each @prisma/client's .prisma directory (node_modules/.pnpm/@prisma+client@<…>/node_modules/
#    .prisma). @prisma/client's postinstall leaves a placeholder client; for backend's 7.x the
#    builder's is what `prisma generate` wrote (@cos/database's 5.x is never generated here, so
#    its placeholder is copied over an identical one). The build fails if a counterpart is missing
#    — a mismatched path would ship the placeholder, which throws on the first query — and so also
#    if the builder ever holds an @prisma/client version that only a devDependency brings;
#  - each installed @cos/* package's dist (its `main`), and backend/dist. packages/@cos/test-utils
#    (its manifest is in `manifests` for the build) is removed: nothing in production loads it.
RUN --mount=type=bind,from=builder,source=/app,target=/built \
    set -e; n=0; p=0; \
    for src in /built/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma; do \
      dst="${src#/built/}"; \
      [ -d "$(dirname "$dst")/@prisma/client" ] || { echo "no $(dirname "$dst")/@prisma/client"; exit 1; }; \
      rm -rf "$dst"; cp -a "$src" "$dst"; n=$((n+1)); \
    done; \
    [ "$n" -gt 0 ] || { echo "no generated Prisma client in the builder"; exit 1; }; \
    rm -rf packages/@cos/test-utils; \
    for pkg in packages/@cos/*; do \
      [ -d "/built/$pkg/dist" ] || { echo "no /built/$pkg/dist"; exit 1; }; \
      cp -a "/built/$pkg/dist" "$pkg/dist"; p=$((p+1)); \
    done; \
    cp -a /built/backend/dist backend/dist; \
    echo "copied $n generated Prisma client(s), $p package dists, backend/dist"

# ─── Stage 5: Runner (production image) ───────────────────────────────────
FROM node:24-slim AS runner
# openssl as in the base stage (kept from the Alpine image; see there).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Non-root user — QM-4 security hardening. uid/gid 1001: the Helm charts run as 1001.
RUN groupadd --system --gid 1001 cosgroup \
 && useradd --system --uid 1001 --gid cosgroup --no-create-home --shell /usr/sbin/nologin cosuser

WORKDIR /app
# Only what runs: the production install with the built output in it (stage 4), at the paths the
# builder had. pnpm's @cos/* entries are RELATIVE symlinks (backend/node_modules/@cos/* →
# ../../../packages/@cos/*) and the generated Prisma client lives in the root node_modules/.pnpm —
# moving node_modules to a shallower path breaks both. Until 2026-11-12 this copied the builder's
# whole /app (repo sources, devDependencies, other services: a 3.35 GB layer). `node
# backend/dist/main` reads nothing from disk outside this tree. Not in it, and not usable in the
# old image either: the prisma CLI, backend/prisma and pg_dump / psql, which the enterprise
# provisioning activities shell out to (register Open item).
COPY --from=prod-deps --chown=cosuser:cosgroup /app ./

USER cosuser
EXPOSE 3000

# node:24-slim has no wget or curl; Node's own fetch does the probe (non-2xx or no answer → unhealthy).
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v1/health/live').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "backend/dist/main"]
