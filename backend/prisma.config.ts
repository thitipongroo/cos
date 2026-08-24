// Prisma 7 Config (ADR-041). Prisma no longer reads `url`/`directUrl` from schema.prisma; the
// migration/CLI connection URL lives here. When a prisma.config.ts is present Prisma does NOT
// auto-load .env, so we load it explicitly.
// Two-file env scheme (spec §08): the only .env is the monorepo ROOT one. The Prisma CLI runs with
// cwd = backend/ (via `pnpm --filter @cos/backend`), so the root .env is ../.env; the second path
// covers an invocation from the repo root. dotenv does not override already-set vars.
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';

// Load the root .env BEFORE defineConfig()/env() below read process.env.
config({ path: resolve(process.cwd(), '../.env') });
config({ path: resolve(process.cwd(), '.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Seed still runs through ts-node (replaces the package.json `seed` script under Prisma 7).
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    // Prisma Migrate/CLI needs the DIRECT (non-PgBouncer) connection — PgBouncer transaction mode
    // breaks migration DDL + advisory locks (QM-18). This replaces the schema `directUrl`.
    // Runtime app connections go through the driver adapter on DATABASE_URL (PgBouncer) instead.
    url: env('DIRECT_DATABASE_URL'),
  },
});
