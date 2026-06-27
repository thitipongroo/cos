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

/** Start PostgreSQL (TimescaleDB) + Redis, set env vars, and run all migrations. */
export async function startIntegrationInfra(): Promise<IntegrationInfra> {
  const [pgContainer, redisContainer] = await Promise.all([
    new PostgreSqlContainer('timescale/timescaledb:latest-pg16').start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);

  const pgUrl = pgContainer.getConnectionUri();
  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

  process.env['DATABASE_URL'] = pgUrl;
  process.env['DIRECT_DATABASE_URL'] = pgUrl;
  process.env['APP_DATABASE_URL'] = pgUrl;
  process.env['REDIS_URL'] = redisUrl;

  const schemaPath = nodePath.resolve(__dirname, '../../prisma/schema.prisma');
  const prismaBin = nodePath.resolve(__dirname, '../../node_modules/.bin/prisma');
  execSync(`"${prismaBin}" migrate deploy --schema "${schemaPath}"`, {
    cwd: os.tmpdir(), // no .env here → Prisma uses the env vars we set above
    env: { ...process.env, DATABASE_URL: pgUrl, DIRECT_DATABASE_URL: pgUrl },
    stdio: 'inherit',
  });

  const prisma = new PrismaClient({ datasources: { db: { url: pgUrl } } });
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
