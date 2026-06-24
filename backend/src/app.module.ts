import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import Redis from 'ioredis';
import { HealthController } from './health.controller';
import { IdentityModule } from './modules/identity/identity.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { ProjectModule } from './modules/project/project.module';
import { BoqModule } from './modules/boq/boq.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { SiteOpsModule } from './modules/site-ops/site-ops.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { SafetyModule } from './modules/safety/safety.module';
import { CrmModule } from './modules/crm/crm.module';
import { VendorPortalModule } from './modules/vendor-portal/vendor-portal.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PlatformWebhookModule } from './modules/platform-webhook/platform-webhook.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { GraphModule } from './modules/graph/graph.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { WorkforceModule } from './modules/workforce/workforce.module';
import { SyncModule } from './modules/sync/sync.module';
import { AuditInterceptor } from './shared/interceptors/audit.interceptor';
import { HttpMetricsInterceptor } from './shared/interceptors/http-metrics.interceptor';
import { RequestIdInterceptor } from './shared/interceptors/request-id.interceptor';
import { TenantContextInterceptor } from './shared/interceptors/tenant-context.interceptor';
import { CloudflareWafMiddleware } from './shared/middleware/cloudflare-waf.middleware';
import { SecureHeadersMiddleware } from './shared/middleware/secure-headers.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        throttlers: [{ ttl: 60000, limit: 100 }],
        storage: new ThrottlerStorageRedisService(new Redis(cfg.getOrThrow<string>('REDIS_URL'))),
      }),
    }),
    TerminusModule,
    IdentityModule,
    TenantModule,
    ProjectModule,
    BoqModule,
    ProcurementModule,
    SiteOpsModule,
    TasksModule,
    SafetyModule,
    CrmModule,
    VendorPortalModule,
    NotificationModule,
    PlatformWebhookModule,
    MasterDataModule,
    GraphModule,
    AnalyticsModule,
    ComplianceModule,
    WorkforceModule, // Phase 22 — now wired (required for self check-in /workers/me, option A)
    SyncModule, // Finding 2 — generic offline sync API (/sync/delta, /sync/push, /sync/resolve)
    // Remaining modules added per phase:
    // Phase 7: FinanceModule
    // Phase 8: (Kafka/event infra wired into all modules)
    // Phase 9: (FileService is a separate deployable)
    // Phase 21: EquipmentModule
    // Phase 22: WorkforceModule
  ],
  controllers: [HealthController],
  providers: [
    // Global rate limiting guard — ThrottlerModule handles limits; Redis storage shared across replicas
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // RequestIdInterceptor must be first — sets request.requestId before AuditInterceptor runs
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    // Projects req.user (set by JwtAuthGuard) onto req.tenantId/tenantCode/userId/userRole
    // before the route handler runs. Must precede AuditInterceptor (which reads tenant context).
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    // HTTP metrics — records http_request_duration_seconds and http_requests_total (Phase 15)
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    // Global audit interceptor — logs all mutating operations (QM-4, Phase 16 RLS)
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecureHeadersMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
    consumer.apply(CloudflareWafMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
