// Buildings Controller — Phase 3 (spatial hierarchy). Nested under projects (create/list),
// flat by id (get/update/delete). RBAC: read = any authenticated tenant user; write =
// PROJECT_MANAGER or TENANT_ADMIN (PO decision 2026-07-05). Versioned under /api/v1 (QM-2).

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
import { BuildingsService } from './buildings.service';
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';
import { ListBuildingsDto } from './dto/list-buildings.dto';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';

@ApiTags('Buildings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class BuildingsController {
  constructor(private readonly service: BuildingsService) {}

  @Post('projects/:projectId/buildings')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a building under a project' })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Building created' })
  @ApiResponse({ status: 404, description: 'Parent project not found (COS-BLDG-002)' })
  create(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateBuildingDto) {
    return this.service.create(projectId, dto);
  }

  @Get('projects/:projectId/buildings')
  @ApiOperation({ summary: 'List buildings in a project (paginated)' })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Paginated building list with nextCursor' })
  list(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() dto: ListBuildingsDto) {
    return this.service.list(projectId, dto);
  }

  @Get('buildings/:id')
  @ApiOperation({ summary: 'Get building by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Building detail' })
  @ApiResponse({ status: 404, description: 'Not found (COS-BLDG-001)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Patch('buildings/:id')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update building metadata' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated building' })
  @ApiResponse({ status: 404, description: 'Not found (COS-BLDG-001)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBuildingDto) {
    return this.service.update(id, dto);
  }

  @Delete('buildings/:id')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a building' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Building deleted' })
  @ApiResponse({ status: 404, description: 'Not found (COS-BLDG-001)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
