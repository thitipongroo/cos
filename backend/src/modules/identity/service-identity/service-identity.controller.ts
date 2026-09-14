// GET /api/v1/auth/identity — the identity file-service, credential-service and ai-gateway take instead of a
// token's claims (ADR-107).
//
// Those claims — `tenant_id`, `user_id`, `role` — are Keycloak user attributes, and none of those services can
// read platform.users. This answer exists only after the full KeycloakJwtStrategy.validate: realm binding
// (OQ-51), subject binding (ADR-106), active user and the DATABASE role (ADR-077), which the strategy writes
// over the token's own `role`.
//
// ONLY ON THE INTERNAL LISTENER (INTERNAL_PORT, revision R8). The public port runs CloudflareWafMiddleware, which
// in production refuses anything without CF-Ray — every call from a pod. InternalOnlyGuard makes the route
// a 404 on the public port.
//
// THE GUARDS, IN ORDER: InternalOnlyGuard (which socket) → ServiceIdentityAuthGuard (the strategy; a backend
// that cannot check the token is 503, not 401) → IdentityThrottlerGuard (per verified user). @SkipThrottle
// switches off only the global ADDRESS-keyed limit, which every call from one pod would share.

import { Controller, Get, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { FeatureFlagService } from '../../../shared/feature-flags/feature-flag.service';
import type { JwtPayload } from '../../../shared/context/jwt-payload';
import {
  AUTHORITATIVE_ROLE_CHECK_FLAG,
  SUBJECT_BINDING_FLAG,
} from '../strategies/keycloak-jwt.strategy';
import {
  IdentityThrottlerGuard,
  InternalOnlyGuard,
  ServiceIdentityAuthGuard,
} from './service-identity.guards';

@ApiTags('auth')
@Controller('auth')
export class ServiceIdentityController {
  constructor(private readonly flags: FeatureFlagService) {}

  @Get('identity')
  @SkipThrottle()
  @UseGuards(InternalOnlyGuard, ServiceIdentityAuthGuard, IdentityThrottlerGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "The caller's verified tenant, user and database role (internal listener only)",
    description:
      'For internal services (ADR-107). Served on INTERNAL_PORT only; 404 on the public port. Never the ' +
      'token claims as sent: while either identity kill switch is OFF it answers 503 instead.',
  })
  @ApiResponse({ status: 200, description: 'Verified identity' })
  @ApiResponse({ status: 401, description: 'Token invalid, or not bound to an active account' })
  @ApiResponse({ status: 503, description: 'The backend could not verify the identity' })
  getIdentity(@Req() req: { user?: JwtPayload }): {
    tenant_id: string;
    user_id: string;
    role: string;
  } {
    // Revision R8 (#4). With either switch OFF, `validate()` hands back the token's own claims — its recovery
    // mode. The backend may run in that mode; the services must not be told those claims are verified. Both
    // are evaluated globally, like the strategy does for subject binding (ADR-106).
    if (
      !this.flags.isEnabled(SUBJECT_BINDING_FLAG) ||
      !this.flags.isEnabled(AUTHORITATIVE_ROLE_CHECK_FLAG)
    ) {
      throw new ServiceUnavailableException({
        error: {
          code: 'COS-AUTH-004',
          message: 'Identity could not be verified right now — try again',
          messageKey: 'auth.identity.unavailable',
        },
      });
    }
    const user = req.user as JwtPayload;
    return { tenant_id: user.tenant_id, user_id: user.user_id, role: user.role };
  }
}
