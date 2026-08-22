// Sync Controller — generic offline sync (Finding 2). Global prefix 'api/v1' → /api/v1/sync/*.

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { PushItemDto, ReportExhaustionDto, ResolveExhaustionDto } from './dto/sync.dto';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { SyncAuthGuard } from './sync-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';

@ApiTags('Sync')
@ApiBearerAuth()
// SyncAuthGuard applies the same role matrix the REST controllers enforce. It MUST stay after
// JwtAuthGuard (it reads req.user) and it is what stops /sync/* from being an unguarded second entry
// point into SiteOps/Safety/Workforce/Annotation services — see sync-authz.ts.
@UseGuards(JwtAuthGuard, SyncAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly service: SyncService) {}

  @Get('delta')
  @ApiOperation({ summary: 'Pull entities changed since a timestamp (offline delta sync)' })
  delta(@Query() query: Record<string, unknown>) {
    const since = String(query['since'] ?? new Date(0).toISOString());
    // mobile sends entity_types[]=...; accept both bracketed and plain keys, single or array.
    const raw = query['entity_types[]'] ?? query['entity_types'];
    const types = raw == null ? [] : Array.isArray(raw) ? raw.map(String) : [String(raw)];
    return this.service.delta(since, types);
  }

  @Post('push')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Push a queued offline mutation; applies the §17.5 conflict strategy' })
  push(@Body() dto: PushItemDto) {
    return this.service.push(dto);
  }

  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply a server-side write with conflict resolution (same as push)' })
  resolve(@Body() dto: PushItemDto) {
    return this.service.push(dto);
  }

  // Deliberately on THIS controller, so SyncAuthGuard's push branch authorises it: reporting that a
  // safety incident failed to sync carries the incident's payload, and should need the same role
  // that could have pushed it. The admin-facing queue routes are a separate controller below,
  // because the guard discriminates GET as `delta` and would try to narrow entity_types from the
  // query string.
  @Post('exhausted')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Report a mutation that exhausted its 5 retries — §17.2 tenant-admin review queue',
  })
  reportExhaustion(@Body() dto: ReportExhaustionDto) {
    return this.service.reportExhaustion(dto);
  }
}

/**
 * The §17.2 review queue, for the tenant admin.
 *
 * §17.2: "a server-side queue visible to Tenant Admin where failed sync records can be reviewed and
 * manually imported. Records are never deleted from the device until successfully synced or
 * explicitly resolved by an admin."
 *
 * A separate controller because SyncAuthGuard resolves authorisation from the HTTP verb — GET means
 * `delta` and would narrow `entity_types` out of the query string. These routes need an ordinary
 * role check instead.
 */
@ApiTags('Sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(CosRole.TENANT_ADMIN)
@Controller('sync/exhaustions')
export class SyncExhaustionController {
  constructor(private readonly service: SyncService) {}

  @Get()
  @ApiOperation({ summary: 'List queued sync exhaustions for review (§17.2)' })
  list(@Query('status') status?: string) {
    return this.service.listExhaustions(status === 'RESOLVED' ? 'RESOLVED' : 'PENDING');
  }

  @Patch(':exhaustionId/resolve')
  @ApiOperation({ summary: 'Mark a queued exhaustion imported or discarded (§17.2)' })
  @ApiParam({ name: 'exhaustionId', format: 'uuid' })
  resolveExhaustion(
    @Param('exhaustionId') exhaustionId: string,
    @Body() dto: ResolveExhaustionDto,
  ) {
    return this.service.resolveExhaustion(exhaustionId, dto);
  }
}
