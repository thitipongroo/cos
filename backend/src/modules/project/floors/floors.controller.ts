// Floors Controller — Phase 3. Nested under buildings (create/list), flat by id (get/update/delete).
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
import { FloorsService } from './floors.service';
import { CreateFloorDto } from './dto/create-floor.dto';
import { UpdateFloorDto } from './dto/update-floor.dto';
import { ListFloorsDto } from './dto/list-floors.dto';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';

@ApiTags('Floors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class FloorsController {
  constructor(private readonly service: FloorsService) {}

  @Post('buildings/:buildingId/floors')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a floor under a building' })
  @ApiParam({ name: 'buildingId', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Floor created' })
  @ApiResponse({ status: 404, description: 'Parent building not found (COS-FLOR-002)' })
  create(@Param('buildingId', ParseUUIDPipe) buildingId: string, @Body() dto: CreateFloorDto) {
    return this.service.create(buildingId, dto);
  }

  @Get('buildings/:buildingId/floors')
  @ApiOperation({ summary: 'List floors in a building (paginated)' })
  @ApiParam({ name: 'buildingId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Paginated floor list with nextCursor' })
  list(@Param('buildingId', ParseUUIDPipe) buildingId: string, @Query() dto: ListFloorsDto) {
    return this.service.list(buildingId, dto);
  }

  @Get('floors/:id')
  @ApiOperation({ summary: 'Get floor by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Floor detail' })
  @ApiResponse({ status: 404, description: 'Not found (COS-FLOR-001)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Patch('floors/:id')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update floor metadata' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated floor' })
  @ApiResponse({ status: 404, description: 'Not found (COS-FLOR-001)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFloorDto) {
    return this.service.update(id, dto);
  }

  @Delete('floors/:id')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a floor' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Floor deleted' })
  @ApiResponse({ status: 404, description: 'Not found (COS-FLOR-001)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
