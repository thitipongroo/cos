// Subject-request endpoints — TENANT_ADMIN only (ADR-090 §4; PDPA-48).
//
// Every route is @Roles(TENANT_ADMIN): this is the controller's own compliance desk, not a feature
// for the roles that create CRM records. A CRM_SALES_MANAGER can add a contact and cannot answer that
// contact's rights request, which is the separation the tenant's own accountability rests on.
//
// The search is a GET and is audited EXPLICITLY in the service — the global AuditInterceptor only
// covers mutating verbs, so without that write the one privileged read here would leave no trace.

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { SubjectRequestService } from './subject-request.service';
import { CreateSubjectRequestDto } from './dto/create-subject-request.dto';
import { CloseSubjectRequestDto } from './dto/close-subject-request.dto';
import { EraseSubjectRequestDto } from './dto/erase-subject-request.dto';
import { SubjectVerifyTokenGuard } from './subject-verify-token.guard';
import type { TenantRequest } from '../../tenant/tenant.middleware';

@ApiTags('subject-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subject-requests')
export class SubjectRequestController {
  constructor(private readonly service: SubjectRequestService) {}

  @Post()
  @Roles(CosRole.TENANT_ADMIN)
  @ApiOperation({
    summary: 'Open a subject request from a person with no platform account',
    description:
      'The tenant is the controller for CRM and vendor contact data; Construction OS is the ' +
      'processor (ADR-090). The row is also the authorisation to search — no search runs without one.',
  })
  @ApiResponse({ status: 201, description: 'Request opened' })
  @ApiResponse({ status: 400, description: 'No identifier, or received_at in the future' })
  create(@Body() dto: CreateSubjectRequestDto, @Req() req: TenantRequest) {
    return this.service.create(dto, req.userId!);
  }

  @Get()
  @Roles(CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'The tenant’s request queue, oldest received first' })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'FULFILLED', 'REJECTED'] })
  list(@Query('status') status?: string) {
    return this.service.list(status);
  }

  // Rate-limited BELOW the platform default (QM-7: 100/min general). Answering rights requests is
  // deliberate desk work measured in minutes per person, so 10/min is generous for the real job and
  // narrow for a script walking an address list — the residual enumeration risk after the
  // request-binding, not a replacement for it.
  @Get(':requestId/matches')
  @Roles(CosRole.TENANT_ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'What the tenant holds about the subject of this request',
    description:
      'Identifiers come from the request row, never from the query string. Writes an audit row ' +
      'carrying the actor, the request and the match count.',
  })
  @ApiResponse({ status: 404, description: 'No such request in this tenant' })
  @ApiResponse({ status: 400, description: 'Request is already closed' })
  matches(@Param('requestId', ParseUUIDPipe) requestId: string, @Req() req: TenantRequest) {
    return this.service.findMatches(requestId, req.userId!);
  }

  @Post(':requestId/erase')
  @Roles(CosRole.TENANT_ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Anonymise in place (QM-5) — clears personal columns, keeps the rows',
    description:
      'ERASURE requests only. Irreversible by design: a hard delete would break ' +
      'crm.contacts.lead_id into a chain Thai accounting law retains for 7 years (ADR-090 §5). ' +
      'Pass legal_hold=true (with a reason) to snapshot the rows to a WORM file first.',
  })
  @ApiResponse({ status: 400, description: 'Request is not an ERASURE, or is already closed' })
  erase(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: EraseSubjectRequestDto,
    @Req() req: TenantRequest,
  ) {
    return this.service.erase(requestId, dto, req.userId!);
  }

  @Post(':requestId/verify')
  @Roles(CosRole.TENANT_ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Email a verification link to the address ON THE MATCHED RECORD',
    description:
      'Proves the answerer controls the identifier the tenant already holds — not that they are ' +
      'who they say they are. The address is taken from the matched record, never from the ' +
      'request: challenging a typed-in address would prove control of a claimed address and say ' +
      'nothing about the person the tenant holds data about (ADR-090 §6). The response masks it.',
  })
  @ApiResponse({ status: 400, description: 'No match, no email on file, or the request is closed' })
  sendVerification(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Req() req: TenantRequest,
  ) {
    return this.service.sendVerification(requestId, req.userId!);
  }

  @Patch(':requestId/close')
  @Roles(CosRole.TENANT_ADMIN)
  @ApiOperation({
    summary: 'Close the request as FULFILLED or REJECTED',
    description:
      'The outcome note is required on both outcomes: a refusal that does not name its basis is ' +
      'itself a breach (ADR-090 §5).',
  })
  @ApiResponse({ status: 404, description: 'No OPEN request with that id in this tenant' })
  close(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: CloseSubjectRequestDto,
    @Req() req: TenantRequest,
  ) {
    return this.service.close(requestId, dto, req.userId!);
  }
}

/**
 * The subject's own confirm endpoint — NOT behind JwtAuthGuard (ADR-090 §6).
 *
 * The person here has no account at all. They authenticate solely with the single-use link, and
 * `SubjectVerifyTokenGuard` publishes the tenant from the token's signed claim so the write below
 * still runs under RLS. Same shape as ContractSignPublicController (ADR-058 CT-5).
 */
@ApiTags('subject-requests')
@Controller()
export class SubjectVerifyPublicController {
  constructor(private readonly service: SubjectRequestService) {}

  @Post('subject-requests/verify/:token')
  @UseGuards(SubjectVerifyTokenGuard)
  @ApiOperation({ summary: 'A data subject confirms a verification link (single use)' })
  @ApiResponse({ status: 400, description: 'Link already used or no longer current' })
  @ApiResponse({ status: 401, description: 'Bad signature or expired link' })
  confirm(@Param('token') token: string) {
    return this.service.confirmVerification(token);
  }
}
