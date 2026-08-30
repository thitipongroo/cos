// Sync Controller — generic offline sync (Finding 2). Global prefix 'api/v1' → /api/v1/sync/*.

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { PushItemDto, ReportExhaustedDto } from './dto/sync.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { SyncAuthGuard } from './sync-auth.guard';

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

  @Post('exhausted')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Report a queued mutation the device has stopped retrying (§17.2 retry exhaustion)',
  })
  reportExhausted(@Body() dto: ReportExhaustedDto) {
    return this.service.reportExhausted(dto);
  }

  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply a server-side write with conflict resolution (same as push)' })
  resolve(@Body() dto: PushItemDto) {
    return this.service.push(dto);
  }
}
