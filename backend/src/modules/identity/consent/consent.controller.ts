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

import { Controller, Get, Post, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ConsentService } from './consent.service';
import { RecordConsentDto } from '../dto/record-consent.dto';
import type { TenantRequest } from '../../tenant/tenant.middleware';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

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
