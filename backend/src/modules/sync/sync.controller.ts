// Sync Controller — generic offline sync (Finding 2). Global prefix 'api/v1' → /api/v1/sync/*.

import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { PushItemDto } from './dto/sync.dto';

@ApiTags('Sync')
@ApiBearerAuth()
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
}
