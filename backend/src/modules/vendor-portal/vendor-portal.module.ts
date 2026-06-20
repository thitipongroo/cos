// VendorPortalModule — external Vendor Portal (ADR-030).
// VendorAuthMiddleware runs on /api/v1/vendor/* to set tenant + vendor context (TenantMiddleware
// bypasses these paths — vendors have no Keycloak JWT). The buyer-side invitation endpoint lives
// under /api/v1/procurement/rfqs/* and uses the normal Keycloak JWT + RBAC.

import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { VendorInvitationController, VendorPortalController } from './vendor-portal.controller';
import { VendorPortalService } from './vendor-portal.service';
import { VendorPortalRepository } from './vendor-portal.repository';
import { VendorIdentityRepository } from './vendor-identity.repository';
import { MagicLinkService } from './magic-link.service';
import { VendorAuthMiddleware } from './vendor-auth.middleware';

@Module({
  imports: [TenantModule],
  controllers: [VendorInvitationController, VendorPortalController],
  providers: [
    VendorPortalService,
    VendorPortalRepository,
    VendorIdentityRepository,
    MagicLinkService,
  ],
  exports: [VendorPortalService],
})
export class VendorPortalModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(VendorAuthMiddleware)
      .forRoutes({ path: 'api/v1/vendor/*', method: RequestMethod.ALL });
  }
}
