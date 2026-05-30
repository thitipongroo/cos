import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TenantMiddleware } from './tenant.middleware';
import { TenantPrismaService } from './prisma/tenant-prisma.service';

@Module({
  providers: [TenantService, TenantPrismaService],
  controllers: [TenantController],
  exports: [TenantService, TenantPrismaService],
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
