import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { TenantModule } from '../tenant/tenant.module';
import { SiteOpsModule } from '../site-ops/site-ops.module';
import { SafetyModule } from '../safety/safety.module';
import { WorkforceModule } from '../workforce/workforce.module';

@Module({
  // Push handlers delegate to these modules' (exported) services; TenantModule provides the
  // tenant-scoped Prisma for delta/tombstone queries.
  imports: [TenantModule, SiteOpsModule, SafetyModule, WorkforceModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService], // entity modules can record tombstones on delete (deferred wiring)
})
export class SyncModule {}
