import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { TombstonePruneService } from './tombstone-prune.service';
import { SyncAuthGuard } from './sync-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { TenantModule } from '../tenant/tenant.module';
import { SiteOpsModule } from '../site-ops/site-ops.module';
import { SafetyModule } from '../safety/safety.module';
import { WorkforceModule } from '../workforce/workforce.module';
import { FilesModule } from '../files/files.module';

@Module({
  // Push handlers delegate to these modules' (exported) services; TenantModule provides the
  // tenant-scoped Prisma for delta/tombstone queries. TombstonePruneService's @Cron is picked up by the
  // app-wide ScheduleModule.forRoot() (registered once, in FinanceModule — its discovery is global).
  imports: [TenantModule, SiteOpsModule, SafetyModule, WorkforceModule, FilesModule],
  controllers: [SyncController],
  // RolesGuard is listed explicitly because SyncAuthGuard INJECTS it (to reuse the primary +
  // additional-roles union) rather than merely naming it in @UseGuards, which is how every other
  // controller uses it — a class Nest instantiates from @UseGuards is not injectable on its own.
  providers: [SyncService, TombstonePruneService, RolesGuard, SyncAuthGuard],
  exports: [SyncService], // entity modules can record tombstones on delete (deferred wiring)
})
export class SyncModule {}
