import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { ClsModule } from 'nestjs-cls';
import { HealthController } from './health.controller';
import { IdentityModule } from './modules/identity/identity.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { ProjectModule } from './modules/project/project.module';
import { BoqModule } from './modules/boq/boq.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { FinanceModule } from './modules/finance/finance.module';
import { SiteOpsModule } from './modules/site-ops/site-ops.module';
import { FilesModule } from './modules/files/files.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { SafetyModule } from './modules/safety/safety.module';
import { GeoModule } from './modules/geo/geo.module';
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
import { CredentialsModule } from './modules/credentials/credentials.module';
import { EquipmentModule } from './modules/equipment/equipment.module';
import { FeatureFlagsModule } from './shared/feature-flags/feature-flags.module';
import { FeatureFlagGuard } from './shared/feature-flags/feature-flag.guard';
import { AuditInterceptor } from './shared/interceptors/audit.interceptor';
import { HttpMetricsInterceptor } from './shared/interceptors/http-metrics.interceptor';
import { RequestIdInterceptor } from './shared/interceptors/request-id.interceptor';
import { TenantContextInterceptor } from './shared/interceptors/tenant-context.interceptor';
import { CloudflareWafMiddleware } from './shared/middleware/cloudflare-waf.middleware';
import { SecureHeadersMiddleware } from './shared/middleware/secure-headers.middleware';
import { TracingShutdownService } from './shared/tracing-shutdown.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    // Global CLS (AsyncLocalStorage) — carries authenticated tenant context across guards,
    // interceptors and (formerly request-scoped) providers. Under Fastify, Passport's req.user does
    // NOT survive into downstream handlers (Fastify clones the request), so JwtAuthGuard publishes the
    // tenant context into CLS and TenantPrismaService reads it from there. `mount` wraps every request
    // in cls.run() before guards run, so values set in the guard persist through the whole pipeline.
    // useEnterWith: true is required under Fastify — Fastify's middleware does not await the rest of
    // the request inside the cls.run() callback, so the context must be entered via als.enterWith().
    ClsModule.forRoot({ global: true, middleware: { mount: true, useEnterWith: true } }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        throttlers: [{ ttl: 60000, limit: 100 }],
        // Pass the URL (not a pre-built Redis): ThrottlerStorageRedisService then OWNS the client and
        // closes it in its own onModuleDestroy (disconnectRequired=true). Passing a Redis instance
        // leaves disconnectRequired falsy, so the socket leaks past app.close() and hangs Jest.
        storage: new ThrottlerStorageRedisService(cfg.getOrThrow<string>('REDIS_URL')),
      }),
    }),
    TerminusModule,
    FeatureFlagsModule, // QM-15 / ADR-049 — Unleash-backed flags + GET /api/v1/flags
    IdentityModule,
    TenantModule,
    ProjectModule,
    BoqModule,
    ProcurementModule,
    FinanceModule,
    SiteOpsModule,
    FilesModule, // Photo annotations — GET endpoint; write path via SyncModule (ADR-056)
    TasksModule,
    SafetyModule,
    GeoModule,
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
    CredentialsModule, // ADR-067 — REST client for the CredentialService (W3C DID/VC) microservice
    EquipmentModule, // Phase 21 — equipment tracking, assignments, maintenance, utilization
    // Phase 8: (Kafka/event infra wired into all modules)
    // Phase 9: (FileService is a separate deployable)
  ],
  controllers: [HealthController],
  providers: [
    // Global rate limiting guard — ThrottlerModule handles limits; Redis storage shared across replicas
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Feature-flag kill switch — only gates routes carrying @FeatureFlag metadata (QM-15; ADR-049)
    { provide: APP_GUARD, useClass: FeatureFlagGuard },
    // RequestIdInterceptor must be first — sets request.requestId before AuditInterceptor runs
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    // Projects req.user (set by JwtAuthGuard) onto req.tenantId/tenantCode/userId/userRole
    // before the route handler runs. Must precede AuditInterceptor (which reads tenant context).
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    // HTTP metrics — records http_request_duration_seconds and http_requests_total (Phase 15)
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    // Global audit interceptor — logs all mutating operations (QM-4, Phase 16 RLS)
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    // Closes the OpenTelemetry SDK (Prometheus exporter) on graceful shutdown (enableShutdownHooks)
    TracingShutdownService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecureHeadersMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
    consumer.apply(CloudflareWafMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
