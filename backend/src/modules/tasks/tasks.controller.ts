// Tasks Controller — Phase 6
// Paths (spec §14): /api/v1/projects/{projectId}/tasks (list, create).
// Progress / status updates: PATCH /api/v1/tasks/{taskId} (master Phase 6 completion gate).

import {
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { CreateDependencyDto } from './dto/create-dependency.dto';

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

  // ── Schedule network and critical path (ADR-097) ────────────────────────────

  // GET /api/v1/tasks/portfolio-summary
  //
  // DECLARED BEFORE `tasks/:taskId`-shaped routes would matter, and on its own literal segment, so
  // there is no chance of `portfolio-summary` being parsed as a task id. It is also the reason this
  // is a GET on `tasks/` rather than `projects/:projectId/…`: the whole point is that it spans the
  // tenant's projects rather than one of them.
  @Get('tasks/portfolio-summary')
  @Roles(...TASK_READ_ROLES)
  @ApiOperation({
    summary: 'Tenant-wide task counts — overdue, due this week, blocked',
    description:
      'Counts every non-cancelled task in the tenant. "Overdue" means planned_end has passed and ' +
      'the task is not finished — it is NOT a priority or severity, because projects.tasks has no ' +
      'such column (ADR-085). A task with no planned_end falls in neither date bucket.',
  })
  portfolioTaskSummary() {
    return this.svc.getPortfolioTaskSummary();
  }

  // GET /api/v1/tasks/portfolio-critical-path
  //
  // A literal segment under `tasks/`, exactly like `portfolio-summary` above and for the same two
  // reasons: it spans the tenant rather than one project, and it can never be parsed as a task id.
  @Get('tasks/portfolio-critical-path')
  @Roles(...TASK_READ_ROLES)
  @ApiOperation({
    summary: 'Critical tasks across every project in the tenant',
    description:
      'Runs the per-project forward/backward pass once per project that has tasks and returns the ' +
      'zero-float tasks of all of them, earliest first, each naming its project. There is no ' +
      'single critical path across projects — each network has its own origin — so this ' +
      'concatenates real per-project results rather than inventing one pass over all of them. ' +
      'Durations are CALENDAR days (ADR-097).',
  })
  portfolioCriticalPath() {
    return this.svc.getPortfolioCriticalPath();
  }

  // GET /api/v1/projects/:projectId/critical-path
  @Get('projects/:projectId/critical-path')
  @Roles(...TASK_READ_ROLES)
  @ApiOperation({
    summary: 'Critical path — forward/backward pass over the project schedule network',
    description:
      'Earliest/latest start and finish and total float per task; the critical path is the ' +
      'zero-float set. Durations are CALENDAR days: no working-day calendar exists in this ' +
      'platform, and the response says so in `working_day_calendar`. Tasks without both planned ' +
      'dates are excluded and counted in `excluded_task_count` (ADR-097).',
  })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  getCriticalPath(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.svc.getCriticalPath(projectId);
  }

  // GET /api/v1/projects/:projectId/task-dependencies
  @Get('projects/:projectId/task-dependencies')
  @Roles(...TASK_READ_ROLES)
  @ApiOperation({ summary: 'List the project schedule network edges' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  listDependencies(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.svc.listDependencies(projectId);
  }

  // POST /api/v1/projects/:projectId/task-dependencies
  //
  // EXECUTIVE IS ABSENT FROM THE WRITE ROLES ON PURPOSE. Phase 10 says the role is read-only on
  // mobile, and the dependency network is authored by the people who own the schedule.
  @Post('projects/:projectId/task-dependencies')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.SITE_ENGINEER, CosRole.TENANT_ADMIN)
  @ApiOperation({
    summary: 'Add one dependency edge',
    description:
      'Rejects an edge that would create a cycle (COS-TASK-003), one whose tasks are not both in ' +
      'this project (COS-TASK-004), and one naming a task that does not exist (COS-TASK-002).',
  })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  addDependency(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateDependencyDto,
  ) {
    return this.svc.addDependency(projectId, dto);
  }

  // DELETE /api/v1/task-dependencies/:dependencyId
  @Delete('task-dependencies/:dependencyId')
  @HttpCode(204)
  @Roles(CosRole.PROJECT_MANAGER, CosRole.SITE_ENGINEER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Remove one dependency edge' })
  @ApiParam({ name: 'dependencyId', type: 'string', format: 'uuid' })
  async removeDependency(@Param('dependencyId', ParseUUIDPipe) dependencyId: string) {
    await this.svc.removeDependency(dependencyId);
  }
}
