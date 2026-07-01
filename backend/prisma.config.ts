// Prisma 7 Config (ADR-041). Prisma no longer reads `url`/`directUrl` from schema.prisma; the
// migration/CLI connection URL lives here. When a prisma.config.ts is present Prisma does NOT
// auto-load .env, so we load it explicitly.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

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
