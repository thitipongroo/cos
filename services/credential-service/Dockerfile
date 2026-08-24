FROM node:24-alpine AS builder
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app
# Non-interactive pnpm (same as CI) — avoids ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY.
ENV CI=true
# Root context: credential-service is a pnpm workspace member, so the frozen install needs every
# workspace package.json present. It imports no @cos/* package today, but "..." keeps the build correct
# if it ever does. .dockerignore trims node_modules/dist/tsbuildinfo.
COPY . .
RUN pnpm install --frozen-lockfile --filter @cos/credential-service...
RUN pnpm --filter @cos/credential-service... --workspace-concurrency=1 build

FROM node:24-alpine AS runner
RUN addgroup --system --gid 1001 cosgroup && adduser --system --uid 1001 --ingroup cosgroup cosuser
WORKDIR /app
# Preserve the full built layout so pnpm's relative symlinks resolve at runtime.
COPY --from=builder --chown=cosuser:cosgroup /app ./
USER cosuser
EXPOSE 3009
# The service exposes a single unauthenticated /health (no /health/live|ready split) — see main.ts.
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget -qO- http://127.0.0.1:3009/health || exit 1
# tsconfig rootDir is ./src, so tsc emits straight to dist/ (unlike the root-rootDir services).
CMD ["node", "services/credential-service/dist/main.js"]
