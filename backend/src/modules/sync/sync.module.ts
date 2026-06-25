import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { TombstonePruneService } from './tombstone-prune.service';
import { TenantModule } from '../tenant/tenant.module';
import { SiteOpsModule } from '../site-ops/site-ops.module';
import { SafetyModule } from '../safety/safety.module';
import { WorkforceModule } from '../workforce/workforce.module';

@Module({
  // Push handlers delegate to these modules' (exported) services; TenantModule provides the
  // tenant-scoped Prisma for delta/tombstone queries. TombstonePruneService's @Cron is picked up by the
  // app-wide ScheduleModule.forRoot() (registered once, in FinanceModule — its discovery is global).
  imports: [TenantModule, SiteOpsModule, SafetyModule, WorkforceModule],
  controllers: [SyncController],
  providers: [SyncService, TombstonePruneService],
  exports: [SyncService], // entity modules can record tombstones on delete (deferred wiring)
})
export class SyncModule {}
