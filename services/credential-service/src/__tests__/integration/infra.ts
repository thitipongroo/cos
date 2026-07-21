// Testcontainers integration infra (CS-9) — a throwaway Postgres 16 with the `credentials` schema
// migration applied, plus a non-superuser `app_user` connection so RLS is actually enforced (the
// container superuser bypasses RLS). Mirrors backend/test/helpers/integration-infra.ts, minus Prisma:
// the credentials schema is raw-SQL migrated, so we apply the migration file directly.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const HERE = dirname(fileURLToPath(import.meta.url));
// services/credential-service/src/__tests__/integration → repo root is five levels up.
const MIGRATION_SQL = resolve(
  HERE,
  '../../../../../backend/prisma/migrations/20260720000002_credentials/migration.sql',
);

const APP_USER = 'app_user';
const APP_PASSWORD = 'app_user_dev_password';

export interface Infra {
  container: StartedPostgreSqlContainer;
  adminPool: pg.Pool; // container superuser — owns the schema, bypasses RLS
  appPool: pg.Pool; // app_user — RLS enforced (the pool the service uses in production)
}

/** Start Postgres 16, create app_user, apply the credentials migration, return both pools. */
export async function startInfra(): Promise<Infra> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const adminUri = container.getConnectionUri();
  const adminPool = new pg.Pool({ connectionString: adminUri });

  // app_user must exist BEFORE the migration: it CREATEs policies `TO app_user` and GRANTs to it.
  await adminPool.query(`CREATE ROLE ${APP_USER} LOGIN PASSWORD '${APP_PASSWORD}'`);
  await adminPool.query(readFileSync(MIGRATION_SQL, 'utf8'));

  const appUri = new URL(adminUri);
  appUri.username = APP_USER;
  appUri.password = APP_PASSWORD;
  const appPool = new pg.Pool({ connectionString: appUri.toString() });

  return { container, adminPool, appPool };
}

/** Tear down pools + container. Safe to call with a partially-started infra. */
export async function stopInfra(infra: Partial<Infra>): Promise<void> {
  await infra.appPool?.end();
  await infra.adminPool?.end();
  await infra.container?.stop();
}
