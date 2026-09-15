import { Module } from '@nestjs/common';
import { PlatformSettingsController } from './platform-settings.controller';
import { PlatformSettingsService } from './platform-settings.service';

// Platform-wide settings (ADR-108) — SYSTEM_ADMIN GET / PUT /api/v1/admin/settings. Stored only: nothing
// imports PlatformSettingsService to act on a value, which is why nothing is exported.
@Module({
  providers: [PlatformSettingsService],
  controllers: [PlatformSettingsController],
})
export class PlatformSettingsModule {}
