// Feature flag system — Unleash, server-evaluated (QM-15; ADR-049).
// Global module: FeatureFlagService is injectable everywhere; FeatureFlagGuard is registered
// as APP_GUARD in app.module.ts and only gates routes carrying @FeatureFlag metadata.

import { Global, Module } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../../modules/identity/guards/optional-jwt-auth.guard';
import { FeatureFlagService } from './feature-flag.service';
import { FlagsController } from './flags.controller';

@Global()
@Module({
  controllers: [FlagsController],
  // OptionalJwtAuthGuard is instantiated in this module's injector; its dependencies (ClsService,
  // LastSeenService) both come from @Global modules, and the 'keycloak-jwt' passport strategy is
  // registered process-wide by IdentityModule before any request is served.
  providers: [FeatureFlagService, OptionalJwtAuthGuard],
  exports: [FeatureFlagService],
})
export class FeatureFlagsModule {}
