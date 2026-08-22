// Rooms Controller — Phase 3. Nested under floors (create/list), flat by id (get/update/delete).
// RBAC: read = any authenticated tenant user; write = PROJECT_MANAGER / TENANT_ADMIN.

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { ListRoomsDto } from './dto/list-rooms.dto';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';

@ApiTags('Rooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class RoomsController {
  constructor(private readonly service: RoomsService) {}

  @Post('floors/:floorId/rooms')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a room under a floor' })
  @ApiParam({ name: 'floorId', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Room created' })
  @ApiResponse({ status: 404, description: 'Parent floor not found (COS-ROOM-002)' })
  create(@Param('floorId', ParseUUIDPipe) floorId: string, @Body() dto: CreateRoomDto) {
    return this.service.create(floorId, dto);
  }

  @Get('floors/:floorId/rooms')
  @ApiOperation({ summary: 'List rooms on a floor (paginated)' })
  @ApiParam({ name: 'floorId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Paginated room list with nextCursor' })
  list(@Param('floorId', ParseUUIDPipe) floorId: string, @Query() dto: ListRoomsDto) {
    return this.service.list(floorId, dto);
  }

  @Get('rooms/:id')
  @ApiOperation({ summary: 'Get room by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Room detail' })
  @ApiResponse({ status: 404, description: 'Not found (COS-ROOM-001)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Patch('rooms/:id')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update room metadata' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated room' })
  @ApiResponse({ status: 404, description: 'Not found (COS-ROOM-001)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoomDto) {
    return this.service.update(id, dto);
  }

  @Delete('rooms/:id')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a room' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Room deleted' })
  @ApiResponse({ status: 404, description: 'Not found (COS-ROOM-001)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
