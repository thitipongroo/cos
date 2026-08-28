// Units Controller — Phase 3. Nested under buildings (create/list), flat by id.
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
import { UnitsService } from './units.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { ListUnitsDto } from './dto/list-units.dto';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';

@ApiTags('Units')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class UnitsController {
  constructor(private readonly service: UnitsService) {}

  @Post('buildings/:buildingId/units')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a unit under a building' })
  @ApiParam({ name: 'buildingId', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Unit created' })
  @ApiResponse({ status: 404, description: 'Parent building not found (COS-UNIT-002)' })
  create(@Param('buildingId', ParseUUIDPipe) buildingId: string, @Body() dto: CreateUnitDto) {
    return this.service.create(buildingId, dto);
  }

  @Get('buildings/:buildingId/units')
  @ApiOperation({ summary: 'List units in a building (paginated)' })
  @ApiParam({ name: 'buildingId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Paginated unit list with nextCursor' })
  list(@Param('buildingId', ParseUUIDPipe) buildingId: string, @Query() dto: ListUnitsDto) {
    return this.service.list(buildingId, dto);
  }

  @Get('units/:id')
  @ApiOperation({ summary: 'Get unit by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Unit detail' })
  @ApiResponse({ status: 404, description: 'Not found (COS-UNIT-001)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Patch('units/:id')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update unit metadata' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated unit' })
  @ApiResponse({ status: 404, description: 'Not found (COS-UNIT-001)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitDto) {
    return this.service.update(id, dto);
  }

  @Delete('units/:id')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a unit' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Unit deleted' })
  @ApiResponse({ status: 404, description: 'Not found (COS-UNIT-001)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
