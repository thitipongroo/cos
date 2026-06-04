import { Module } from '@nestjs/common';
import { BoqController } from './boq.controller';
import { BoqService } from './boq.service';
import { BoqRepository } from './boq.repository';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [BoqController],
  providers: [BoqService, BoqRepository],
  exports: [BoqService],
})
export class BoqModule {}
