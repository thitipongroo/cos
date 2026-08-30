// Shared integration infrastructure for Testcontainers specs.
//
// Spins a TimescaleDB-enabled PostgreSQL + Redis, wires the env vars the app actually reads, and
// applies all Prisma migrations. Encapsulates the gotchas proven out in project.integration:
//   - DB image must ship TimescaleDB (migrations call create_hypertable) — ADR-032.
//   - The app connects via APP_DATABASE_URL (RLS app role), falling back to DATABASE_URL; migrations
//     use directUrl (DIRECT_DATABASE_URL). All three must point at the container, or the app
//     reads/writes a different DB than we migrate.
//   - Prisma CLI gives .env precedence over the passed DATABASE_URL, so migrate runs from a cwd
//     WITHOUT a .env (os.tmpdir) with an absolute --schema path.

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../src/shared/prisma/create-prisma-client';
import { execSync } from 'child_process';
import * as os from 'os';
import * as nodePath from 'path';

export interface IntegrationInfra {
  pgContainer: StartedPostgreSqlContainer;
  redisContainer: StartedRedisContainer;
  pgUrl: string;
  redisUrl: string;
  prisma: PrismaClient;
}

/**
 * How long a container may take to become ready.
 *
 * testcontainers 10.28.0 defaults to 60_000. That default is written for a suite starting one or two
 * containers on an idle daemon; `test:integration` runs 41 suites SERIALLY and each starts its own
 * Postgres + Redis, so the fortieth start competes with whatever the previous suites have not
 * finished reclaiming. 60s was never chosen for this workload — it is simply the library default.
 *
 * NOT a proven fix for the 2026-08-26 failure, where phase-22-workforce failed all 19 of its cases
 * after 366s in a full run and then passed alone and on the next two full runs. That failure was not
 * reproduced and its message was not captured, so its cause is unknown. What this does is stop a
 * slow start from being read as a broken suite.
 */
const CONTAINER_STARTUP_TIMEOUT_MS = 180_000;

/**
 * How long `prisma migrate deploy` may run before the harness gives up on it.
 *
 * It had NO timeout: execSync blocks until the child exits, so an unreachable or wedged database
 * meant the suite sat there indefinitely and then reported nineteen unrelated-looking failures. A
 * bound turns that into one legible error at a known point instead of six minutes of silence.
 * Generous on purpose — the deploy applies ~100 migrations and is slow, just not unbounded.
 */
const MIGRATE_TIMEOUT_MS = 300_000;

/** Start PostgreSQL (TimescaleDB) + Redis, set env vars, and run all migrations. */
export async function startIntegrationInfra(): Promise<IntegrationInfra> {
  const [pgContainer, redisContainer] = await Promise.all([
    new PostgreSqlContainer('timescale/timescaledb:latest-pg16')
      .withStartupTimeout(CONTAINER_STARTUP_TIMEOUT_MS)
      .start(),
    new RedisContainer('redis:7-alpine').withStartupTimeout(CONTAINER_STARTUP_TIMEOUT_MS).start(),
  ]);

  const pgUrl = pgContainer.getConnectionUri();
  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

  process.env['DATABASE_URL'] = pgUrl;
  process.env['DIRECT_DATABASE_URL'] = pgUrl;
  process.env['APP_DATABASE_URL'] = pgUrl;
  process.env['REDIS_URL'] = redisUrl;

  const schemaPath = nodePath.resolve(__dirname, '../../prisma/schema.prisma');
  const prismaBin = nodePath.resolve(__dirname, '../../node_modules/.bin/prisma');
  // Prisma 7 reads the migration datasource URL from prisma.config.ts. It auto-discovers that file
  // in the cwd, but we run from os.tmpdir() (to dodge .env precedence), so point at it with --config.
  const configPath = nodePath.resolve(__dirname, '../../prisma.config.ts');
  try {
    execSync(`"${prismaBin}" migrate deploy --schema "${schemaPath}" --config "${configPath}"`, {
      cwd: os.tmpdir(), // no .env here → Prisma uses the env vars we set above
      env: { ...process.env, DATABASE_URL: pgUrl, DIRECT_DATABASE_URL: pgUrl },
      stdio: 'inherit',
      timeout: MIGRATE_TIMEOUT_MS,
    });
  } catch (err) {
    // Say WHICH database and WHY, at the point of failure. Without this the caller's beforeAll
    // throws something about a child process and jest attributes it to every test in the file — the
    // shape that made the 2026-08-26 failure unreadable.
    const killed = (err as { signal?: string }).signal;
    throw new Error(
      killed
        ? `prisma migrate deploy was killed (${killed}) after ${MIGRATE_TIMEOUT_MS}ms against ${pgUrl}` +
            ' — the container started but the database did not accept the migrations in time'
        : `prisma migrate deploy failed against ${pgUrl}: ${(err as Error).message}`,
    );
  }

  const prisma = createPrismaClient(pgUrl);
  return { pgContainer, redisContainer, pgUrl, redisUrl, prisma };
}

/** Tear down everything started by {@link startIntegrationInfra}. Safe to call partially. */
export async function stopIntegrationInfra(infra: Partial<IntegrationInfra>): Promise<void> {
  await infra.prisma?.$disconnect();
  await Promise.all([infra.pgContainer?.stop(), infra.redisContainer?.stop()]);
}

export interface TestUser {
  tenant_id?: string;
  user_id?: string;
  role?: string;
  tenantCode?: string;
}

/**
 * A JwtAuthGuard replacement that publishes the test user's tenant context into CLS exactly like the
 * real guard (ADR-031) — required, or tenant-scoped services see an empty context and return 401.
 * `getUser` receives the request, so specs can vary the user per-request (e.g. role by auth header).
 */
export function clsAuthGuard(getUser: (req: Record<string, unknown>) => TestUser): {
  canActivate: (ctx: unknown) => boolean;
} {
  return {
    canActivate: (ctx: unknown): boolean => {
      const req = (ctx as { switchToHttp: () => { getRequest: () => Record<string, unknown> } })
        .switchToHttp()
        .getRequest();
      const u = getUser(req);
      req['user'] = u;
      req['tenantId'] = u.tenant_id;
      req['userId'] = u.user_id;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ClsServiceManager } = require('nestjs-cls') as typeof import('nestjs-cls');
      const cls = ClsServiceManager.getClsService();
      if (u.tenant_id && cls.isActive()) {
        cls.set('tenantId', u.tenant_id);
        cls.set('userId', u.user_id);
        cls.set('userRole', u.role);
        cls.set('tenantCode', u.tenantCode);
        cls.set('dedicatedDbUrl', undefined);
      }
      return true;
    },
  };
}
