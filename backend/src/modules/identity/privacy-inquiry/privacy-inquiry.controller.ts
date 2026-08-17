// Privacy-inquiry endpoints (ADR-091).
//
// TWO CONTROLLERS IN ONE FILE, and the split is the security boundary. The POST is PUBLIC — it is the
// only way a person with no account can reach the platform about their own data — and the reads are
// SYSTEM_ADMIN. Keeping them in separate classes means the guards are declared per class rather than
// per method, so an admin route cannot be added to the public class by accident and inherit no guard.
// Same shape as ContractSignPublicController beside FinanceController (ADR-058 CT-5).

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { FeatureFlag } from '../../../shared/feature-flags/feature-flag.decorator';
import { PrivacyInquiryService } from './privacy-inquiry.service';
import { CreatePrivacyInquiryDto } from './dto/create-privacy-inquiry.dto';

/** QM-15 kill-switch. New feature → default OFF until rollout (docs/feature-flags/registry.md). */
export const PRIVACY_INQUIRY_FLAG = 's1.identity.privacy-inquiry';

@ApiTags('privacy-inquiries')
@Controller()
export class PrivacyInquiryPublicController {
  constructor(private readonly service: PrivacyInquiryService) {}

  // Rate-limited at the QM-7 AUTH tier (10/min per IP), not the general 100/min tier. This route is
  // unauthenticated and writes a row, which puts it in the same class as OTP request — the limit
  // `identity.controller.ts` already carries — rather than with ordinary reads. It is the principal
  // bound on a publicly writable table, together with the DTO's length caps.
  @Post('privacy/inquiries')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @FeatureFlag(PRIVACY_INQUIRY_FLAG)
  @ApiOperation({
    summary: 'Lodge a privacy inquiry without an account',
    description:
      'For a person who has no account here and may not know which organisation on this platform ' +
      'holds their data (ADR-091). Returns a reference to quote — nothing supplied is echoed back. ' +
      'This is NOT a PDPA §30 request in its own right: the controller is the tenant, and the ' +
      'statutory clock starts when the tenant receives it.',
  })
  @ApiResponse({ status: 201, description: 'Accepted — returns `reference` and `received_at`' })
  @ApiResponse({ status: 400, description: 'A field is missing, malformed or over its length cap' })
  @ApiResponse({ status: 429, description: 'Rate limited (10/min per IP) — `Retry-After` is set' })
  @ApiResponse({ status: 503, description: 'COS-FLAG-001 — the feature flag is off' })
  create(@Body() dto: CreatePrivacyInquiryDto) {
    return this.service.create(dto);
  }
}

@ApiTags('privacy-inquiries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('privacy/inquiries')
export class PrivacyInquiryAdminController {
  constructor(private readonly service: PrivacyInquiryService) {}

  // SYSTEM_ADMIN, not TENANT_ADMIN. The queue is cross-tenant by construction — the whole point is
  // that the sender has not been matched to a tenant yet — so a tenant admin reading it would be
  // reading strangers' inquiries about other organisations. Once an inquiry IS matched, the work
  // moves to that tenant's own `platform.subject_requests` queue, which is TENANT_ADMIN (ADR-090).
  @Get()
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'The triage queue, oldest received first' })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'ROUTED', 'CLOSED'] })
  list(@Query('status') status?: string) {
    return this.service.list(status);
  }

  @Get(':reference')
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'One inquiry, by the reference the sender was given' })
  @ApiResponse({ status: 404, description: 'No inquiry with that reference' })
  findOne(@Param('reference') reference: string) {
    return this.service.findByReference(reference);
  }
}
