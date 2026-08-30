// Notification Controller — Phase 20
// Includes both REST endpoints and SSE stream (NOT WebSocket — spec §19.2).

import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  ParseUUIDPipe,
  Body,
  Query,
  Req,
  Sse,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { NotificationSseService, type SseMessageEvent } from './notification.sse.service';
import { UpdatePreferencesDto, RegisterDeviceTokenDto } from './dto/update-preferences.dto';

type AuthRequest = Request & {
  tenantId?: string;
  user?: { user_id?: string };
};

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class NotificationController {
  constructor(
    private readonly svc: NotificationService,
    private readonly sse: NotificationSseService,
  ) {}

  // GET /api/v1/notifications
  @Get('notifications')
  @ApiOperation({ summary: 'List my notifications (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @Req() req: AuthRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.svc.listNotifications(
      req.tenantId!,
      req.user!.user_id!,
      Math.max(1, page),
      Math.min(100, Math.max(1, limit)),
    );
  }

  // PATCH /api/v1/notifications/:id/read
  @Patch('notifications/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  markRead(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.markRead(req.tenantId!, id, req.user!.user_id!);
  }

  // PATCH /api/v1/notifications/read-all
  @Patch('notifications/read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@Req() req: AuthRequest) {
    return this.svc.markAllRead(req.tenantId!, req.user!.user_id!);
  }

  // GET /api/v1/notifications/preferences
  @Get('notifications/preferences')
  @ApiOperation({ summary: 'Get my notification channel preferences' })
  getPreferences(@Req() req: AuthRequest) {
    return this.svc.getPreferences(req.tenantId!, req.user!.user_id!);
  }

  // PATCH /api/v1/notifications/preferences
  @Patch('notifications/preferences')
  @ApiOperation({ summary: 'Update my notification channel preferences' })
  updatePreferences(@Req() req: AuthRequest, @Body() dto: UpdatePreferencesDto) {
    const quietHours =
      dto.quiet_hours_start !== undefined && dto.quiet_hours_end !== undefined
        ? { start: dto.quiet_hours_start, end: dto.quiet_hours_end }
        : undefined;
    return this.svc.updatePreferences(
      req.tenantId!,
      req.user!.user_id!,
      dto.preferences,
      quietHours,
    );
  }

  // POST /api/v1/notifications/device-token
  @Post('notifications/device-token')
  @ApiOperation({ summary: 'Register Expo push device token' })
  registerDeviceToken(@Req() req: AuthRequest, @Body() dto: RegisterDeviceTokenDto) {
    return this.svc.registerDeviceToken({
      tenant_id: req.tenantId!,
      user_id: req.user!.user_id!,
      push_token: dto.push_token,
      platform: dto.platform,
    });
  }

  // GET /api/v1/notifications/stream  — SSE, NOT WebSocket (spec §19.2)
  @Sse('notifications/stream')
  @ApiOperation({ summary: 'SSE stream of real-time in-app notifications' })
  stream(@Req() req: AuthRequest): Observable<SseMessageEvent> {
    return this.sse.stream(req.user!.user_id!);
  }
}
