FROM node:24-alpine AS builder
# pnpm comes from package.json's packageManager (version + sha512): Corepack downloads it on first use
# and refuses a tarball whose hash differs. Do not name a version here: one source keeps CI, Docker and
# dev machines on the same pnpm.
RUN corepack enable
WORKDIR /app
# Non-interactive pnpm (same as CI) — avoids ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY.
ENV CI=true
# Root context: credential-service is a pnpm workspace member, so the frozen install needs every
# workspace package.json present. It imports @cos/service-identity (src/plugins/auth.ts); "..." builds
# it, and any @cos/* package it comes to import. .dockerignore trims node_modules/dist/tsbuildinfo.
COPY . .
RUN pnpm install --frozen-lockfile --filter @cos/credential-service...
RUN pnpm --filter @cos/credential-service... --workspace-concurrency=1 build

# ─── Production dependencies ──────────────────────────────────────────────
# A fresh `--prod` install from the same tree and filter (so the frozen install sees every workspace
# manifest), then the builder's output into it, each at the path it had there: the dist (`main`) of
# every @cos/* package the builder built (this service's closure, today) and this service's dist. The
# build fails if the service's dist is missing, or if any @cos/* link the install made points at a
# package with no dist. Until
# 2026-11-12 the runner copied the builder's whole /app — repo sources and devDependencies (jest,
# typescript, ts-jest, testcontainers, …) — measured in docs/registers/dependency-advisories-2026-11.md.
FROM node:24-alpine AS prod-deps
RUN corepack enable
WORKDIR /app
ENV CI=true
COPY . .
RUN pnpm install --frozen-lockfile --prod --filter @cos/credential-service...
RUN --mount=type=bind,from=builder,source=/app,target=/built \
    set -e; p=0; \
    for pkg in packages/@cos/*; do \
      [ -d "/built/$pkg/dist" ] || continue; \
      cp -a "/built/$pkg/dist" "$pkg/dist"; p=$((p+1)); \
    done; \
    [ -d /built/services/credential-service/dist ] || { echo "no /built/services/credential-service/dist"; exit 1; }; \
    cp -a /built/services/credential-service/dist services/credential-service/dist; \
    for link in services/credential-service/node_modules/@cos/* packages/@cos/*/node_modules/@cos/*; do \
      [ -e "$link" ] || continue; \
      [ -d "$(readlink -f "$link")/dist" ] || { echo "$link has no dist"; exit 1; }; \
    done; \
    echo "copied $p package dists and services/credential-service/dist"

FROM node:24-alpine AS runner
RUN addgroup --system --gid 1001 cosgroup && adduser --system --uid 1001 --ingroup cosgroup cosuser
WORKDIR /app
# Only what runs, at the paths the builder had (pnpm's @cos/* links are relative): the production
# node_modules, packages/ (manifests, installed packages' dist and node_modules; sources are small),
# and this service's package.json, node_modules and dist. Everything read from disk at runtime is
# under these paths: the service's dist, the @cos/* dists (@cos/kafka's dist/avro schemas), and the
# dependencies' own files (e.g. @fastify/swagger-ui's static assets).
COPY --from=prod-deps --chown=cosuser:cosgroup /app/package.json ./
COPY --from=prod-deps --chown=cosuser:cosgroup /app/node_modules ./node_modules
COPY --from=prod-deps --chown=cosuser:cosgroup /app/packages ./packages
COPY --from=prod-deps --chown=cosuser:cosgroup /app/services/credential-service/package.json ./services/credential-service/
COPY --from=prod-deps --chown=cosuser:cosgroup /app/services/credential-service/node_modules ./services/credential-service/node_modules
COPY --from=prod-deps --chown=cosuser:cosgroup /app/services/credential-service/dist ./services/credential-service/dist
USER cosuser
EXPOSE 3009
# The service exposes a single unauthenticated /health (no /health/live|ready split) — see main.ts.
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget -qO- http://127.0.0.1:3009/health || exit 1
# tsconfig rootDir is ./src, so tsc emits straight to dist/ (unlike the root-rootDir services).
CMD ["node", "services/credential-service/dist/main.js"]
