// Master Data Controller — Priority 0 Section D
// RBAC:
//   Read (GET list):  all authenticated roles — field workers need dropdowns
//   Write (POST/PATCH/DELETE): TENANT_ADMIN only

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  ParseUUIDPipe,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { MasterDataService } from './master-data.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { CreateWorkCategoryDto } from './dto/create-work-category.dto';
import { UpdateWorkCategoryDto } from './dto/update-work-category.dto';
import { CreateIssueCategoryDto } from './dto/create-issue-category.dto';
import { CreateCostCategoryDto } from './dto/create-cost-category.dto';

const ALL_ROLES = [
  CosRole.TENANT_ADMIN,
  CosRole.EXECUTIVE,
  CosRole.PROJECT_MANAGER,
  CosRole.PROCUREMENT_OFFICER,
  CosRole.PROC_MANAGER,
  CosRole.FINANCE,
  CosRole.SAFETY_OFFICER,
  CosRole.SITE_ENGINEER,
  CosRole.SITE_WORKER,
  CosRole.CRM_SALES_MANAGER,
  CosRole.VIEWER,
];

@ApiTags('master-data')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class MasterDataController {
  constructor(private readonly svc: MasterDataService) {}

  // ── Materials ─────────────────────────────────────────────────────────────

  @Get('materials')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'List active materials' })
  listMaterials() {
    return this.svc.listMaterials();
  }

  @Post('materials')
  @Roles(CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a material (TENANT_ADMIN)' })
  createMaterial(@Body() dto: CreateMaterialDto) {
    return this.svc.createMaterial(dto);
  }

  @Patch('materials/:id')
  @Roles(CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update a material (TENANT_ADMIN)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  updateMaterial(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMaterialDto) {
    return this.svc.updateMaterial(id, dto);
  }

  @Delete('materials/:id')
  @Roles(CosRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a material (TENANT_ADMIN)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  async deleteMaterial(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.svc.deleteMaterial(id);
  }

  // ── Work Categories ───────────────────────────────────────────────────────

  @Get('work-categories')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'List active work categories' })
  listWorkCategories() {
    return this.svc.listWorkCategories();
  }

  @Post('work-categories')
  @Roles(CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a work category (TENANT_ADMIN)' })
  createWorkCategory(@Body() dto: CreateWorkCategoryDto) {
    return this.svc.createWorkCategory(dto);
  }

  @Patch('work-categories/:id')
  @Roles(CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update a work category (TENANT_ADMIN)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  updateWorkCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkCategoryDto) {
    return this.svc.updateWorkCategory(id, dto);
  }

  // ── Issue Categories ──────────────────────────────────────────────────────

  @Get('issue-categories')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'List active issue categories' })
  listIssueCategories() {
    return this.svc.listIssueCategories();
  }

  @Post('issue-categories')
  @Roles(CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create an issue category (TENANT_ADMIN)' })
  createIssueCategory(@Body() dto: CreateIssueCategoryDto) {
    return this.svc.createIssueCategory(dto);
  }

  // ── Cost Categories ───────────────────────────────────────────────────────

  @Get('cost-categories')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'List active cost categories' })
  listCostCategories() {
    return this.svc.listCostCategories();
  }

  @Post('cost-categories')
  @Roles(CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a cost category (TENANT_ADMIN)' })
  createCostCategory(@Body() dto: CreateCostCategoryDto) {
    return this.svc.createCostCategory(dto);
  }
}
