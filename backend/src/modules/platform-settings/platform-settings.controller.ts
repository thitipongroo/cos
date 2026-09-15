import { Body, Controller, Get, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import type { TenantRequest } from '../../shared/context/tenant-request';
import { PlatformSettingsService } from './platform-settings.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import type { PlatformSettings, PlatformSettingsResponse } from './platform-settings.types';

// §6.7 "Platform configuration". SYSTEM_ADMIN only, both routes. The values are stored only — nothing
// reads them to change behaviour (ADR-108) — and every save is audited with its justification.
@ApiTags('platform-settings')
@ApiBearerAuth()
@Controller('admin/settings')
export class PlatformSettingsController {
  constructor(private readonly service: PlatformSettingsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Read the platform-wide settings (SYSTEM_ADMIN only)' })
  async get(): Promise<PlatformSettingsResponse> {
    return this.service.get();
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary:
      'Replace the platform-wide settings — versioned, justified, audited (SYSTEM_ADMIN only)',
  })
  async update(
    @Body() dto: UpdatePlatformSettingsDto,
    @Req() req: TenantRequest,
  ): Promise<PlatformSettingsResponse> {
    // No 'system' fallback: the audit row needs a real actor and a real home tenant, and a request that
    // reached here without them has not been authenticated the way this route requires.
    if (!req.userId || !req.tenantId) {
      throw new UnauthorizedException('Authenticated operator context missing from request');
    }
    return this.service.update(
      dto.version,
      // The DTO instance serialises to exactly the validated document: the global pipe whitelists every
      // level, so no key the DTO does not declare survives to be stored.
      dto.settings as unknown as PlatformSettings,
      dto.justification,
      { userId: req.userId, tenantId: req.tenantId },
    );
  }
}
