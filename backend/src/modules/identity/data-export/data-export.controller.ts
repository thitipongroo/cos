// PDPA §30 access / §31 portability — the signed-in user exporting their OWN data (ADR-078).
//
// Closes PDPA-10/11, recorded OPEN in docs/compliance/pdpa-controls.md.
//
// Under @Controller('users') with a `me/` path, matching ConsentController and UserMeController: this
// codebase has two self-service conventions — `auth` for auth primitives, `users/me` for "the signed-in
// user's own record" — and a subject-rights request is the latter. ADR-078 rejected the
// `/api/v1/identity/me/...` path sketched in pdpa-controls.md: `identity` is not a route prefix here,
// and inventing a third namespace for one feature would leave the API with two ways to say "me".
//
// NO @Roles. Every route scopes by the JWT's user_id on top of RLS, so a caller reaches only their
// own requests — there is no role that should be able to export someone else's data through here.
// An admin acting on a subject's behalf is a different, auditable flow, not this one.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { FeatureFlag } from '../../../shared/feature-flags/feature-flag.decorator';
import { DataExportService } from './data-export.service';
import { RequestDataExportDto } from '../dto/request-data-export.dto';
import type { ExportCategory } from './data-export.collector';
import type { TenantRequest } from '../../../shared/context/tenant-request';

/**
 * QM-15 / ADR-049 kill switch.
 *
 * Gates the DOWNLOAD as well as the request. That is the point of having it: the incident this
 * switch exists for is "the export is producing wrong data" — a bad join putting one person's rows in
 * another's archive — and in that incident the archives already sitting in MinIO are exactly what
 * must stop being handed out. A switch that only blocked new requests would leave the damaging
 * artefacts downloadable.
 */
const DATA_EXPORT_FLAG = 's1.identity.data-export';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class DataExportController {
  constructor(private readonly exports: DataExportService) {}

  // POST /api/v1/users/me/data-export
  @Post('me/data-export')
  @HttpCode(HttpStatus.ACCEPTED)
  @FeatureFlag(DATA_EXPORT_FLAG) // QM-15 kill-switch (ADR-049)
  @ApiOperation({
    summary: 'Request an export of your own data (PDPA §30/§31)',
    description:
      'Requires a single-use action token from POST /auth/step-up/verify — re-proving possession ' +
      'before an archive of every category of a person’s data is assembled. 202, not 201: the ' +
      'export reads across every domain schema and is produced by a Temporal workflow, so the ' +
      'response is the request’s state, not the archive. Poll GET /users/me/data-export, or wait ' +
      'for the email. There is no separate rate limit here — every request needs a fresh action ' +
      'token and step-up already caps those at 10 per user per day.',
  })
  @ApiResponse({ status: 202, description: 'Export request accepted and queued' })
  @ApiResponse({ status: 403, description: 'COS-PDPA-002 — step-up verification required' })
  @ApiResponse({ status: 422, description: 'COS-PDPA-003 — the reporting window is inverted' })
  @ApiResponse({ status: 503, description: 'COS-FLAG-001 — feature disabled' })
  async request(@Req() req: TenantRequest, @Body() dto: RequestDataExportDto) {
    return this.exports.request({
      tenantId: req.tenantId!,
      userId: req.userId!,
      actionToken: dto.action_token,
      categories: dto.categories as ExportCategory[],
      format: dto.format,
      // Parsed here rather than in the DTO: @IsDateString validates the wire format, and the service
      // takes Dates so it can compare the bounds. `undefined` stays undefined — an absent bound is
      // "no bound", not the epoch.
      fromDate: dto.from_date ? new Date(dto.from_date) : null,
      toDate: dto.to_date ? new Date(dto.to_date) : null,
    });
  }

  // GET /api/v1/users/me/data-export
  @Get('me/data-export')
  @FeatureFlag(DATA_EXPORT_FLAG)
  @ApiOperation({
    summary: 'List your own export requests and their status',
    description:
      'Newest first. `downloadable` says whether a download can be attempted right now, so the ' +
      'client does not have to re-derive "READY, has a file, and not past expires_at". A FAILED ' +
      'request carries `failureReason` — a sentence for the reader, never a stack trace.',
  })
  @ApiResponse({ status: 200, description: 'The caller’s export requests' })
  async list(@Req() req: TenantRequest) {
    return this.exports.list(req.tenantId!, req.userId!);
  }

  // GET /api/v1/users/me/data-export/:exportId/download
  @Get('me/data-export/:exportId/download')
  @FeatureFlag(DATA_EXPORT_FLAG)
  @ApiOperation({
    summary: 'Mint a short-lived download link for a finished export',
    description:
      'Returns a freshly signed URL on every call rather than a link that was emailed days ago. ' +
      'The archive holds every coordinate the subject was recorded at, so a week-long bearer URL ' +
      'sitting in a mailbox was rejected in ADR-078: `expires_at` is the REQUEST’s 7-day validity, ' +
      'and the URL’s own lifetime is File Service’s (SIGNED_URL_TTL_SECONDS), returned alongside it.',
  })
  @ApiResponse({ status: 200, description: 'A signed URL and the seconds it remains valid' })
  @ApiResponse({
    status: 404,
    description: 'COS-PDPA-004 not yours · COS-PDPA-006 not retrievable',
  })
  @ApiResponse({ status: 422, description: 'COS-PDPA-005 — still preparing, or it failed' })
  @ApiResponse({ status: 410, description: 'COS-PDPA-007 — expired; the archive is deleted' })
  async download(
    @Req() req: TenantRequest,
    // Validated as a UUID at the edge: it reaches a ::uuid cast, and a malformed value would surface
    // as a database error rather than a 404 the caller can act on.
    @Param('exportId', new ParseUUIDPipe()) exportId: string,
  ) {
    return this.exports.downloadUrl(req.tenantId!, req.userId!, exportId);
  }
}
