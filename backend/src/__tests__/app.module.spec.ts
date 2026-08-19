// The application's module graph must actually build.
//
// WHY THIS EXISTS. Two bugs shipped into `develop` that every other test in this repo was blind to,
// and both stopped the application from starting at all:
//
//   1. A circular module dependency — identity → files → tenant → identity — introduced when ADR-078
//      gave IdentityModule a FilesModule import for the export upload. Nest reported "The module at
//      index [0] is of type undefined" and never got as far as a route.
//   2. `NetworkOriginService` (ADR-080) injecting `TenantPrismaService` while IdentityModule imported
//      no module that exports it: "Nest can't resolve dependencies of the NetworkOriginService
//      (GeoIpService, ConsentService, ?)".
//
// Neither was a code error a unit test could see. Every service spec constructs its subject with
// `new` and hands it mocks — which is the correct way to test a service, and says nothing about
// whether the CONTAINER can build one. 2,779 unit tests passed against an application that could not
// boot, and the only reason anyone found out is that someone tried to run it.
//
// `compile()` builds the injector — resolving every provider in every module — without calling
// `onModuleInit`, so no database, Kafka broker, Redis or Keycloak is touched. That is the whole
// trick: the failure mode is a graph problem, and the graph can be checked in isolation.

// The module graph pulls in Prisma clients and Kafka producers at construction time. They are never
// connected (see above), but their constructors run, so the noisy ones are stubbed to keep this a
// test about wiring rather than about infrastructure.
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';

describe('AppModule', () => {
  // REDIS_URL is set HERE and nowhere else — deliberately not in the workflow's job env.
  //
  // ThrottlerModule's factory calls cfg.getOrThrow('REDIS_URL'), so compiling AppModule needs it.
  // But five services (exchange-rate, mfa, otp, device-trust, step-up) read it as
  // `process.env['REDIS_URL'] ?? 'redis://localhost:6379'`, and istanbul instruments `a ?? b` as one
  // branch with a location per operand. With the variable UNSET, `undefined ?? '…'` evaluates both
  // operands and the branch is fully covered; SET, it short-circuits, the right operand is never
  // evaluated, and each of those files drops to ~94-97% branch — which failed the QM-1 100% gate.
  // Measured both ways on exchange-rate.service.spec.ts: 100% unset, 94.44% set.
  //
  // Scoping it to this file gets both: every other spec still sees it unset (fallback operand
  // covered), and this one gets a value. Coverage is cumulative across the run, so the left operand
  // this file exercises only adds to the total. afterAll restores the previous state because jest
  // workers reuse a process across spec files.
  //
  // APP_DATABASE_URL is pinned here for a different reason: not coverage, but ISOLATION. It normally
  // arrives from the repo-root .env via ConfigModule, but several specs (tenant-prisma.service,
  // get-db-url) delete it to exercise the "refuse to fall back to the superuser role" path, and jest
  // reuses a worker process across spec files. Whether this suite saw the variable therefore depended
  // on which files happened to run before it in the same worker — AuditInterceptor calls
  // appDatabaseUrl() in a field initializer, so an unset variable fails the compile with an error
  // about RLS that has nothing to do with the module graph. Setting it here makes the result
  // independent of scheduling; the same save/restore keeps the deletion tests unaffected.
  const previousRedisUrl = process.env['REDIS_URL'];
  const previousAppDbUrl = process.env['APP_DATABASE_URL'];
  beforeAll(() => {
    process.env['REDIS_URL'] = 'redis://localhost:6379';
    process.env['APP_DATABASE_URL'] ??= 'postgresql://app_user@localhost:6432/construction_os';
  });
  afterAll(() => {
    if (previousRedisUrl === undefined) delete process.env['REDIS_URL'];
    else process.env['REDIS_URL'] = previousRedisUrl;
    if (previousAppDbUrl === undefined) delete process.env['APP_DATABASE_URL'];
    else process.env['APP_DATABASE_URL'] = previousAppDbUrl;
  });

  it('resolves every provider in every module', async () => {
    // If a provider anywhere in the application asks for something no imported module exports, this
    // throws UnknownDependenciesException naming the provider and the missing argument — the exact
    // error that reached a terminal instead of a test on 2026-08-05.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  }, 60_000);
});
