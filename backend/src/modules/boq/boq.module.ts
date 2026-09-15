import { Module } from '@nestjs/common';
import { BoqController } from './boq.controller';
import { BoqService } from './boq.service';
import { BoqRepository } from './boq.repository';
import { TenantModule } from '../tenant/tenant.module';
import { CentralPricesModule } from '../central-prices/central-prices.module';

@Module({
  // CentralPricesModule — ADR-061 reference price lookup for BOQ lines (CentralPriceCatalogService).
  imports: [TenantModule, CentralPricesModule],
  controllers: [BoqController],
  providers: [BoqService, BoqRepository],
  exports: [BoqService],
})
export class BoqModule {}
