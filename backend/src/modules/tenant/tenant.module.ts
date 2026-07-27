import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TenantPrismaService } from './prisma/tenant-prisma.service';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserMeController } from './user-me.controller';
import { MyTenantController } from './my-tenant.controller';
import { TenantSettingsService } from './settings.service';
import { TenantSettingsRepository } from './settings.repository';
import { TenantSettingsController } from './settings.controller';
import { IdentityModule } from '../identity/identity.module';

// Tenant context (req.tenantId/tenantCode/userId/userRole) is resolved in
// KeycloakJwtStrategy.validate(), which runs as part of JwtAuthGuard — AFTER the JWT is
// verified. It was previously a pre-auth middleware, but NestJS runs middleware before
// guards, so it never saw req.user and every authenticated request 401'd. The
// TenantMiddleware class is kept only for the TenantRequest type and its unit tests.
@Module({
  imports: [IdentityModule],
  providers: [
    TenantService,
    TenantPrismaService,
    UserService,
    TenantSettingsService,
    TenantSettingsRepository,
  ],
  controllers: [
    TenantController,
    UserController,
    UserMeController,
    MyTenantController,
    TenantSettingsController,
  ],
  exports: [TenantService, TenantPrismaService, UserService],
})
export class TenantModule {}
