// GET /api/v1/flags — server-evaluated feature flags for web/mobile clients (ADR-049).
// Clients poll this endpoint (and may cache the result for offline use); they never talk to
// Unleash directly and hold no flag-provider credentials.

import { Controller, Get, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FeatureFlagService } from './feature-flag.service';

interface FlagRequest {
  userId?: string;
  tenantId?: string;
}

@ApiTags('flags')
@Controller('flags')
export class FlagsController {
  constructor(private readonly flags: FeatureFlagService) {}

  @Get()
  @ApiOperation({ summary: 'Server-evaluated feature flags for the calling user/tenant' })
  @ApiResponse({ status: 200, description: 'Map of flag name → enabled' })
  getFlags(@Req() req: FlagRequest): { flags: Record<string, boolean> } {
    return { flags: this.flags.allFlags({ userId: req.userId, tenantId: req.tenantId }) };
  }
}
