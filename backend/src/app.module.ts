import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { IdentityModule } from './modules/identity/identity.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { AuditInterceptor } from './shared/interceptors/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    TerminusModule,
    IdentityModule,
    TenantModule,
    // Remaining modules added per phase:
    // Phase 3: ProjectModule
    // Phase 4: BoqModule
    // Phase 5: ProcurementModule
    // Phase 6: SiteOpsModule
    // Phase 7: FinanceModule
    // Phase 8: (Kafka/event infra wired into all modules)
    // Phase 9: (FileService is a separate deployable)
    // Phase 20: NotificationModule
    // Phase 21: EquipmentModule
    // Phase 22: WorkforceModule
  ],
  controllers: [HealthController],
  providers: [
    // Global audit interceptor — logs all mutating operations (QM-4, Phase 16 RLS)
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
