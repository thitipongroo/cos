// VendorPortalModule — external Vendor Portal (ADR-030).
// VendorAuthGuard is applied on VendorPortalController (/api/v1/vendor/*) and publishes the tenant +
// vendor context into CLS. It is a guard rather than middleware so that it runs inside the CLS
// context the global ClsModule middleware opens — see vendor-auth.guard.ts for why the middleware
// form could never reach TenantPrismaService. TenantMiddleware bypasses these paths (vendors have no
// Keycloak JWT). The buyer-side invitation endpoint lives under /api/v1/procurement/rfqs/* and uses
// the normal Keycloak JWT + RBAC.

import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { VendorInvitationController, VendorPortalController } from './vendor-portal.controller';
import { VendorPortalService } from './vendor-portal.service';
import { VendorPortalRepository } from './vendor-portal.repository';
import { VendorIdentityRepository } from './vendor-identity.repository';
import { MagicLinkService } from './magic-link.service';
import { VendorAuthGuard } from './vendor-auth.guard';

@Module({
  imports: [TenantModule],
  controllers: [VendorInvitationController, VendorPortalController],
  providers: [
    VendorPortalService,
    VendorPortalRepository,
    VendorIdentityRepository,
    MagicLinkService,
    VendorAuthGuard,
  ],
  exports: [VendorPortalService],
})
export class VendorPortalModule {}
