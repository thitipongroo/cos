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
  it('resolves every provider in every module', async () => {
    // If a provider anywhere in the application asks for something no imported module exports, this
    // throws UnknownDependenciesException naming the provider and the missing argument — the exact
    // error that reached a terminal instead of a test on 2026-08-05.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  }, 60_000);
});
