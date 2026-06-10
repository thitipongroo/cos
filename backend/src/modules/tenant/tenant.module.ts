import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TenantMiddleware } from './tenant.middleware';
import { TenantPrismaService } from './prisma/tenant-prisma.service';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [IdentityModule],
  providers: [TenantService, TenantPrismaService, UserService],
  controllers: [TenantController, UserController],
  exports: [TenantService, TenantPrismaService, UserService],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'api/v1/health/(.*)', method: RequestMethod.ALL },
        { path: 'api/v1/auth/(.*)', method: RequestMethod.ALL },
        { path: 'api/v1/admin/(.*)', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
