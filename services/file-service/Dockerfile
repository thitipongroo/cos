# Debian (node:24-slim), not Alpine, since 2026-11-12 (D40): the same image runs the Temporal workers
# (`…/src/workers/main.js`, the cos-file-service chart's worker Deployment), and @temporalio/core-bridge
# ships glibc builds only, so on musl they exited at once (`__register_atfork: symbol not found`).
# Every stage moves: native packages pick their libc build at install time.
FROM node:24-slim AS builder
# pnpm comes from package.json's packageManager (version + sha512): Corepack downloads it on first use
# and refuses a tarball whose hash differs. Do not name a version here: one source keeps CI, Docker and
# dev machines on the same pnpm.
RUN corepack enable
WORKDIR /app
# Non-interactive pnpm (same as CI) — avoids ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY.
ENV CI=true
# file-service imports @cos/logger, @cos/shared and @cos/types, so the build must build those
# workspace packages too. Install + build the whole closure ("...") in topological order
# (workspace-concurrency=1 = deps before dependents). Copy source first so every workspace
# package.json exists for the frozen install; .dockerignore trims node_modules/dist/tsbuildinfo.
COPY . .
RUN pnpm install --frozen-lockfile --filter @cos/file-service...
RUN pnpm --filter @cos/file-service... --workspace-concurrency=1 build

# ─── Production dependencies ──────────────────────────────────────────────
# A fresh `--prod` install from the same tree and filter (so the frozen install sees every workspace
# manifest), then the builder's output into it, each at the path it had there: the dist (`main`) of
# every @cos/* package the builder built (this service's closure, today) and this service's dist. The
# build fails if the service's dist is missing, or if any @cos/* link the install made points at a
# package with no dist. Until
# 2026-11-12 the runner copied the builder's whole /app — repo sources and devDependencies (jest,
# typescript, ts-jest, testcontainers, …) — measured in docs/registers/dependency-advisories-2026-11.md.
FROM node:24-slim AS prod-deps
RUN corepack enable
WORKDIR /app
ENV CI=true
COPY . .
RUN pnpm install --frozen-lockfile --prod --filter @cos/file-service...
RUN --mount=type=bind,from=builder,source=/app,target=/built \
    set -e; p=0; \
    for pkg in packages/@cos/*; do \
      [ -d "/built/$pkg/dist" ] || continue; \
      cp -a "/built/$pkg/dist" "$pkg/dist"; p=$((p+1)); \
    done; \
    [ -d /built/services/file-service/dist ] || { echo "no /built/services/file-service/dist"; exit 1; }; \
    cp -a /built/services/file-service/dist services/file-service/dist; \
    for link in services/file-service/node_modules/@cos/* packages/@cos/*/node_modules/@cos/*; do \
      [ -e "$link" ] || continue; \
      [ -d "$(readlink -f "$link")/dist" ] || { echo "$link has no dist"; exit 1; }; \
    done; \
    echo "copied $p package dists and services/file-service/dist"

FROM node:24-slim AS runner
# uid/gid 1001: the Helm charts run as 1001.
# npm and npx come with the Node base image and nothing here runs them; their bundled brace-expansion
# and undici failed CI's Trivy image scan (HIGH, fixed versions exist), so the runner drops them
# (2026-11-12, D43).
RUN groupadd --system --gid 1001 cosgroup \
 && useradd --system --uid 1001 --gid cosgroup --no-create-home --shell /usr/sbin/nologin cosuser \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
# Only what runs, at the paths the builder had (pnpm's @cos/* links are relative): the production
# node_modules, packages/ (manifests, installed packages' dist and node_modules; sources are small),
# and this service's package.json, node_modules and dist. Everything read from disk at runtime is
# under these paths: the service's dist, the @cos/* dists (@cos/kafka's dist/avro schemas), and the
# dependencies' own files (e.g. @fastify/swagger-ui's static assets).
COPY --from=prod-deps --chown=cosuser:cosgroup /app/package.json ./
COPY --from=prod-deps --chown=cosuser:cosgroup /app/node_modules ./node_modules
COPY --from=prod-deps --chown=cosuser:cosgroup /app/packages ./packages
COPY --from=prod-deps --chown=cosuser:cosgroup /app/services/file-service/package.json ./services/file-service/
COPY --from=prod-deps --chown=cosuser:cosgroup /app/services/file-service/node_modules ./services/file-service/node_modules
COPY --from=prod-deps --chown=cosuser:cosgroup /app/services/file-service/dist ./services/file-service/dist
USER cosuser
EXPOSE 3002
# node:24-slim has no wget or curl; Node's own fetch does the probe (non-2xx or no answer → unhealthy).
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3002/health/live').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# tsconfig rootDir is the repo root, so tsc emits under dist/services/file-service/src/.
CMD ["node", "services/file-service/dist/services/file-service/src/main.js"]
