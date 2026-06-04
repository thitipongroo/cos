import { Module } from '@nestjs/common';
import { SiteOpsController } from './site-ops.controller';
import { SiteOpsService } from './site-ops.service';
import { SiteOpsRepository } from './site-ops.repository';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [SiteOpsController],
  providers: [SiteOpsService, SiteOpsRepository],
  exports: [SiteOpsService],
})
export class SiteOpsModule {}
