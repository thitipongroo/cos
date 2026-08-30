// Structures Controller — Phase 3. Nested under buildings (create/list), flat by id.
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
import { StructuresService } from './structures.service';
import { CreateStructureDto } from './dto/create-structure.dto';
import { UpdateStructureDto } from './dto/update-structure.dto';
import { ListStructuresDto } from './dto/list-structures.dto';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';

@ApiTags('Structures')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class StructuresController {
  constructor(private readonly service: StructuresService) {}

  @Post('buildings/:buildingId/structures')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a structure under a building' })
  @ApiParam({ name: 'buildingId', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Structure created' })
  @ApiResponse({ status: 404, description: 'Parent building not found (COS-STRC-002)' })
  create(@Param('buildingId', ParseUUIDPipe) buildingId: string, @Body() dto: CreateStructureDto) {
    return this.service.create(buildingId, dto);
  }

  @Get('buildings/:buildingId/structures')
  @ApiOperation({ summary: 'List structures in a building (paginated)' })
  @ApiParam({ name: 'buildingId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Paginated structure list with nextCursor' })
  list(@Param('buildingId', ParseUUIDPipe) buildingId: string, @Query() dto: ListStructuresDto) {
    return this.service.list(buildingId, dto);
  }

  @Get('structures/:id')
  @ApiOperation({ summary: 'Get structure by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Structure detail' })
  @ApiResponse({ status: 404, description: 'Not found (COS-STRC-001)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Patch('structures/:id')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update structure metadata' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated structure' })
  @ApiResponse({ status: 404, description: 'Not found (COS-STRC-001)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStructureDto) {
    return this.service.update(id, dto);
  }

  @Delete('structures/:id')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a structure' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Structure deleted' })
  @ApiResponse({ status: 404, description: 'Not found (COS-STRC-001)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
