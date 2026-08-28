// Tasks Controller — Phase 6
// Paths (spec §14): /api/v1/projects/{projectId}/tasks (list, create).
// Progress / status updates: PATCH /api/v1/tasks/{taskId} (master Phase 6 completion gate).

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseUUIDPipe,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { PolicyGuard } from '../../shared/guards/policy.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

const TASK_READ_ROLES = [
  CosRole.EXECUTIVE,
  CosRole.PROJECT_MANAGER,
  CosRole.SITE_ENGINEER,
  CosRole.SITE_WORKER,
  CosRole.TENANT_ADMIN,
] as const;
const TASK_WRITE_ROLES = [
  CosRole.SITE_WORKER,
  CosRole.SITE_ENGINEER,
  CosRole.PROJECT_MANAGER,
  CosRole.TENANT_ADMIN,
] as const;

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PolicyGuard)
@Controller()
export class TasksController {
  constructor(private readonly svc: TasksService) {}

  // GET /api/v1/projects/:projectId/progress
  @Get('projects/:projectId/progress')
  @Roles(...TASK_READ_ROLES)
  @ApiOperation({
    summary: 'Project progress — BOQ-value-weighted earned percent, planned percent, and SPI',
    description:
      'Formula and thresholds: 32-implementation-specifications §32.12. Every field is nullable; ' +
      'null means not computable (no BOQ-linked task, or nothing planned to have started yet), ' +
      'never zero.',
  })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  getProjectProgress(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.svc.getProjectProgress(projectId);
  }

  // GET /api/v1/projects/:projectId/tasks  (filter ?assigned_to=&status=)
  @Get('projects/:projectId/tasks')
  @Roles(...TASK_READ_ROLES)
  @ApiOperation({ summary: 'List tasks for a project (filter by assignee, status)' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'assigned_to', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listTasks(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('assigned_to') assigned_to?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.listTasks({
      project_id: projectId,
      assigned_to,
      status,
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    });
  }

  // POST /api/v1/projects/:projectId/tasks
  @Post('projects/:projectId/tasks')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.SITE_ENGINEER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a task' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  createTask(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateTaskDto) {
    return this.svc.createTask(projectId, dto);
  }

  // PATCH /api/v1/tasks/:taskId  (progress / status; COMPLETED enforces the gate)
  @Patch('tasks/:taskId')
  @Roles(...TASK_WRITE_ROLES)
  @ApiOperation({ summary: 'Update task progress / status (completion gate on COMPLETED)' })
  @ApiParam({ name: 'taskId', type: 'string', format: 'uuid' })
  updateTask(@Param('taskId', ParseUUIDPipe) taskId: string, @Body() dto: UpdateTaskDto) {
    return this.svc.updateTask(taskId, dto);
  }
}
