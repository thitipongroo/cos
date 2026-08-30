// Assets Controller — Phase 3 (§11.2). Nested under projects (create/list), flat by id.
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
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { ListAssetsDto } from './dto/list-assets.dto';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';

@ApiTags('Assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class AssetsController {
  constructor(private readonly service: AssetsService) {}

  @Post('projects/:projectId/assets')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create an asset under a project' })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Asset created' })
  @ApiResponse({ status: 404, description: 'Parent project not found (COS-ASST-002)' })
  create(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateAssetDto) {
    return this.service.create(projectId, dto);
  }

  @Get('projects/:projectId/assets')
  @ApiOperation({ summary: 'List assets in a project (paginated)' })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Paginated asset list with nextCursor' })
  list(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() dto: ListAssetsDto) {
    return this.service.list(projectId, dto);
  }

  @Get('assets/:id')
  @ApiOperation({ summary: 'Get asset by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Asset detail' })
  @ApiResponse({ status: 404, description: 'Not found (COS-ASST-001)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Patch('assets/:id')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update asset metadata' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated asset' })
  @ApiResponse({ status: 404, description: 'Not found (COS-ASST-001)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAssetDto) {
    return this.service.update(id, dto);
  }

  @Delete('assets/:id')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an asset' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Asset deleted' })
  @ApiResponse({ status: 404, description: 'Not found (COS-ASST-001)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
