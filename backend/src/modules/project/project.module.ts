// Phase 3: Project Service
// REQUEST-scoped because ProjectService and ProjectRepository depend on
// per-request tenant context (TenantPrismaService is also REQUEST-scoped).

import { Module } from '@nestjs/common';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { ProjectRepository } from './project.repository';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [ProjectController],
  providers: [ProjectService, ProjectRepository],
  exports: [ProjectService],
})
export class ProjectModule {}
