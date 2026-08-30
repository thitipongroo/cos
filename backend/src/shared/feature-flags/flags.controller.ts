// GET /api/v1/flags — server-evaluated feature flags for web/mobile clients (ADR-049).
// Clients poll this endpoint (and may cache the result for offline use); they never talk to
// Unleash directly and hold no flag-provider credentials.

import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '../guards/optional-jwt-auth.guard';
import { FeatureFlagService } from './feature-flag.service';

interface FlagRequest {
  userId?: string;
  tenantId?: string;
}

// Optional auth, not open and not closed (see OptionalJwtAuthGuard). The login screen reads
// `s1.identity.sms-otp-login` before a token exists, so this endpoint cannot require one; but with no
// guard at all req.userId/req.tenantId — projected from req.user by TenantContextInterceptor — were
// ALWAYS undefined, so per-user and per-tenant Unleash targeting silently never applied and every
// caller got the default-context evaluation. The guard populates that context when a token is present.
@ApiTags('flags')
@UseGuards(OptionalJwtAuthGuard)
@Controller('flags')
export class FlagsController {
  constructor(private readonly flags: FeatureFlagService) {}

  @Get()
  @ApiOperation({
    summary:
      'Server-evaluated feature flags. Anonymous callers get default-context evaluation; a valid ' +
      'bearer token adds user/tenant targeting.',
  })
  @ApiResponse({ status: 200, description: 'Map of flag name → enabled' })
  getFlags(@Req() req: FlagRequest): { flags: Record<string, boolean> } {
    return { flags: this.flags.allFlags({ userId: req.userId, tenantId: req.tenantId }) };
  }
}
