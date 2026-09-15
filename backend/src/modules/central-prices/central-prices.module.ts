import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { CENTRAL_PRICE_ADAPTER } from './adapters/central-price-adapter';
import { EgpCentralPriceAdapter } from './adapters/egp-central-price-adapter.stub';
import { CentralPriceCatalogService } from './central-price-catalog.service';
import { CentralPricesAdminController } from './central-prices-admin.controller';
import { CentralPricesAdminService } from './central-prices-admin.service';
import { CentralPricesController } from './central-prices.controller';

/**
 * ราคากลาง central prices (ADR-061). Exports CentralPriceCatalogService — the only way another module
 * (BOQ) reads the catalog.
 */
@Module({
  imports: [TenantModule],
  controllers: [CentralPricesAdminController, CentralPricesController],
  providers: [
    CentralPriceCatalogService,
    CentralPricesAdminService,
    // Strategy (§13.3): the stub until a verified e-GP source exists (D9). Swap the class, not the callers.
    { provide: CENTRAL_PRICE_ADAPTER, useClass: EgpCentralPriceAdapter },
  ],
  exports: [CentralPriceCatalogService],
})
export class CentralPricesModule {}
