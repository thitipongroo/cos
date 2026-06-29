FROM node:24-alpine AS builder
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
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

FROM node:24-alpine AS runner
RUN addgroup --system --gid 1001 cosgroup && adduser --system --uid 1001 --ingroup cosgroup cosuser
WORKDIR /app
# Preserve the full built layout so pnpm's relative @cos/* symlinks resolve at runtime.
COPY --from=builder --chown=cosuser:cosgroup /app ./
USER cosuser
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget -qO- http://127.0.0.1:3002/health/live || exit 1
# tsconfig rootDir is the repo root, so tsc emits under dist/services/file-service/src/.
CMD ["node", "services/file-service/dist/services/file-service/src/main.js"]
