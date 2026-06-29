FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY services/file-service/package.json ./services/file-service/
RUN pnpm install --frozen-lockfile --filter @cos/file-service
COPY . .
RUN pnpm --filter @cos/file-service build

FROM node:20-alpine AS runner
RUN addgroup --system --gid 1001 cosgroup && adduser --system --uid 1001 --ingroup cosgroup cosuser
WORKDIR /app
COPY --from=builder --chown=cosuser:cosgroup /app/services/file-service/dist ./dist
COPY --from=builder --chown=cosuser:cosgroup /app/services/file-service/node_modules ./node_modules
USER cosuser
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget -qO- http://localhost:3002/health/live || exit 1
CMD ["node", "dist/main.js"]
