// FeatureFlagsModule wiring (QM-15; ADR-049).
//
// WHY THIS SPEC SUPPLIES PROVIDERS THE MODULE DOES NOT DECLARE: FeatureFlagsModule registers
// OptionalJwtAuthGuard in its own injector, and that guard extends JwtAuthGuard, whose constructor
// takes ClsService (nestjs-cls) and LastSeenService. At runtime both arrive from @Global modules —
// ClsModule.forRoot() and LastSeenModule — registered once in app.module.ts. A testing module built
// from `imports: [FeatureFlagsModule]` alone has no ambient globals, so Nest could not resolve
// LastSeenService and this spec failed with "Nest can't resolve dependencies of the
// OptionalJwtAuthGuard (ClsService, ?)". The production wiring was never wrong — the test was
// compiling the module in a world its dependencies do not exist in.
//
// Doubles rather than the real modules, deliberately: LastSeenService builds a PrismaClient at field
// initialisation, so importing LastSeenModule here would open a database client inside a unit test.

import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { FeatureFlagsModule } from '../feature-flags.module';
import { FeatureFlagService } from '../feature-flag.service';
import { FlagsController } from '../flags.controller';
import { LastSeenService } from '../../last-seen/last-seen.service';
import { OptionalJwtAuthGuard } from '../../guards/optional-jwt-auth.guard';

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), error: jest.fn() }),
}));

// @Global(), not plain `providers:` on the testing module. Providers declared at the testing-module
// root are NOT visible inside an imported module's injector, so FeatureFlagsModule still could not
// resolve them — the first attempt at this fix failed with the identical error. Marking the doubles
// global reproduces exactly how app.module.ts supplies them (ClsModule.forRoot() + LastSeenModule are
// both @Global), which is the condition the module documents as its assumption.
@Global()
@Module({
  providers: [
    { provide: ClsService, useValue: { get: jest.fn(), set: jest.fn() } },
    { provide: LastSeenService, useValue: { touch: jest.fn() } },
  ],
  exports: [ClsService, LastSeenService],
})
class GlobalDoublesModule {}

const buildModule = () =>
  Test.createTestingModule({ imports: [GlobalDoublesModule, FeatureFlagsModule] }).compile();

describe('FeatureFlagsModule', () => {
  beforeEach(() => {
    delete process.env['UNLEASH_URL'];
  });

  it('compiles and exposes FeatureFlagService + FlagsController', async () => {
    const mod = await buildModule();
    expect(mod.get(FeatureFlagService)).toBeInstanceOf(FeatureFlagService);
    expect(mod.get(FlagsController)).toBeInstanceOf(FlagsController);
    await mod.close();
  });

  it('resolves OptionalJwtAuthGuard from its own injector', async () => {
    // The module's own comment claims it can instantiate the guard locally because the guard's deps
    // are global. That claim is exactly what the DI failure disproved in this spec's old form, so
    // assert it directly instead of letting a successful compile imply it.
    const mod = await buildModule();
    expect(mod.get(OptionalJwtAuthGuard)).toBeInstanceOf(OptionalJwtAuthGuard);
    await mod.close();
  });
});
