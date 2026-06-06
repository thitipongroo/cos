import { Module } from '@nestjs/common';
import { MasterDataController } from './master-data.controller';
import { MasterDataService } from './master-data.service';
import { MasterDataRepository } from './master-data.repository';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [MasterDataController],
  providers: [MasterDataService, MasterDataRepository],
  exports: [MasterDataService],
})
export class MasterDataModule {}
