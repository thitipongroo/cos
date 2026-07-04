// Feature flag system — Unleash, server-evaluated (QM-15; ADR-049).
// Global module: FeatureFlagService is injectable everywhere; FeatureFlagGuard is registered
// as APP_GUARD in app.module.ts and only gates routes carrying @FeatureFlag metadata.

import { Global, Module } from '@nestjs/common';
import { FeatureFlagService } from './feature-flag.service';
import { FlagsController } from './flags.controller';

@Global()
@Module({
  controllers: [FlagsController],
  providers: [FeatureFlagService],
  exports: [FeatureFlagService],
})
export class FeatureFlagsModule {}
