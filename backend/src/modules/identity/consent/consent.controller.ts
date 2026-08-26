// PDPA §19 consent — the signed-in user reading and changing their OWN consent decisions (ADR-079).
//
// Under @Controller('users') with a `me/` path, matching UserMeController: this codebase has exactly
// two self-service conventions — `auth` for auth primitives, `users/me` for "the signed-in user's own
// record" — and consent is the latter. No @Roles: every route scopes by the JWT's user_id, so a
// caller can only ever reach their own decisions.
//
// Audit is NOT written here. AuditInterceptor already logs every POST/PATCH/DELETE with actor,
// tenant, path and IP (QM-4); writing a second row from this controller would double-count one
// decision and make the consent history look busier than it is.

import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Ip,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ConsentService } from './consent.service';
import { NetworkOriginService } from '../network-origin/network-origin.service';
import { RecordConsentDto } from '../dto/record-consent.dto';
import type { TenantRequest } from '../../../shared/context/tenant-request';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class ConsentController {
  constructor(
    private readonly consent: ConsentService,
    private readonly networkOrigin: NetworkOriginService,
  ) {}

  // GET /api/v1/users/me/network-origin
  @Get('me/network-origin')
  @ApiOperation({
    summary: 'What the platform can tell about the caller’s own network origin (ADR-080)',
    description:
      'Derived at read time and never stored: city, region and ISP are resolved from the caller’s ' +
      'own ingress IP against a self-hosted GeoLite2 database, and discarded. The address is taken ' +
      'from the request, never from a parameter — otherwise this would be a geo-IP lookup service ' +
      'for anyone holding a session. The behavioural label is profiling and requires `operational` ' +
      'consent; without it the field is null ("Not enabled"), which the screen must render ' +
      'differently from INSUFFICIENT_DATA ("too few check-ins"). The rule’s thresholds are returned ' +
      'alongside so the label can be shown with its derivation rather than as an assertion.',
  })
  @ApiResponse({ status: 200, description: 'Network origin and behavioural context' })
  async getNetworkOrigin(@Req() req: TenantRequest, @Ip() ip: string) {
    return this.networkOrigin.describe({
      tenantId: req.tenantId!,
      userId: req.userId!,
      // @Ip() honours the trusted-proxy configuration (src/shared/trusted-proxy.ts), so behind
      // Cloudflare this is the client address rather than the edge's.
      ipAddress: ip,
    });
  }

  // GET /api/v1/users/me/consents
  @Get('me/consents')
  @ApiOperation({
    summary: "The signed-in user's consent state for every @pdpa category",
    description:
      'Returns all five categories, not only the withdrawable ones. Categories on the CONTRACT ' +
      'basis (identity, contact — PDPA §24(3)) report granted:true, withdrawable:false: they are ' +
      'processed and the subject is entitled to be told so, but the route out is erasure, not ' +
      'withdrawal. A category with no recorded decision reports granted:false — PDPA §19 requires ' +
      'an affirmative act, so silence is never consent.',
  })
  @ApiResponse({ status: 200, description: 'Consent state per category, with lawful basis' })
  async getState(@Req() req: TenantRequest) {
    return this.consent.getState(req.tenantId!, req.userId!);
  }

  // POST /api/v1/users/me/consents
  @Post('me/consents')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Record a consent decision (grant or withdraw)',
    description:
      'Append-only: a grant and a withdrawal both insert a new row and the prior row is never ' +
      'mutated, so the history PDPA-22 requires survives. Withdrawal is forward-only — it stops ' +
      'future collection for that purpose and does not delete what was lawfully collected while ' +
      'consent was live (that is erasure, PDPA-13). Only consent-basis purposes are accepted.',
  })
  @ApiResponse({ status: 204, description: 'Decision recorded' })
  @ApiResponse({ status: 400, description: 'Unknown purpose, or a contract-basis category' })
  async record(@Req() req: TenantRequest, @Body() dto: RecordConsentDto): Promise<void> {
    await this.consent.record({
      tenantId: req.tenantId!,
      userId: req.userId!,
      purpose: dto.purpose,
      granted: dto.granted,
      noticeVersion: dto.notice_version,
    });
  }
}
