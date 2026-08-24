// Project Controller — Phase 3
// All endpoints versioned under /api/v1/projects (QM-2).
// RBAC enforced via @Roles decorator + RolesGuard (Phase 2 guards).
// Validation via class-validator (QM-4).
// Error structure follows QM-10.

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
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { TransitionProjectDto } from './dto/transition-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { ListProjectsDto } from './dto/list-projects.dto';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a new project (DRAFT status)' })
  @ApiResponse({ status: 201, description: 'Project created' })
  @ApiResponse({ status: 422, description: 'Business rule violation (COS-PROJ-*)' })
  create(@Body() dto: CreateProjectDto) {
    return this.projectService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List projects (paginated, filterable)' })
  @ApiResponse({ status: 200, description: 'Paginated project list with nextCursor' })
  list(@Query() dto: ListProjectsDto) {
    return this.projectService.list(dto);
  }

  // Declared before @Get(':id') so the literal path "mine" is not captured as an :id param.
  @Get('mine')
  @ApiOperation({ summary: "The signed-in user's own projects (project_members) — JWT-scoped" })
  @ApiResponse({ status: 200, description: 'The projects the caller is a member of' })
  listMine() {
    return this.projectService.listMine();
  }

  // Declared before @Get(':id') so the literal segment "user" is not captured as an :id param.
  @Get('user/:userId')
  @Roles(CosRole.TENANT_ADMIN)
  @ApiOperation({
    summary: "A specific user's projects (project_members) — TENANT_ADMIN, tenant-scoped",
  })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The projects that user is a member of' })
  listForUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.projectService.listForUser(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Project detail' })
  @ApiResponse({ status: 404, description: 'Not found (COS-PROJ-001)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectService.findById(id);
  }

  @Patch(':id')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update project metadata (not status)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated project' })
  @ApiResponse({ status: 422, description: 'Not editable in current status (COS-PROJ-002)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto) {
    return this.projectService.update(id, dto);
  }

  @Post(':id/transitions')
  // A transition mutates an existing project (it does not create a resource) → 200, not the
  // POST default 201; matches the documented @ApiResponse below.
  @HttpCode(HttpStatus.OK)
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Trigger a project status transition' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Project after transition' })
  @ApiResponse({ status: 422, description: 'Transition not allowed (COS-PROJ-003)' })
  transition(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionProjectDto) {
    return this.projectService.transition(id, dto);
  }

  @Post(':id/members')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Add or update a project member' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Member added or role updated' })
  addMember(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMemberDto) {
    return this.projectService.addMember(id, dto);
  }

  @Delete(':id/members/:userId')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a project member' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Member removed' })
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.projectService.removeMember(id, userId);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List project members' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Member list' })
  listMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectService.listMembers(id);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'List project documents' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Document list' })
  listDocuments(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectService.listDocuments(id);
  }
}
