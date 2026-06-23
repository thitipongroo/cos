// Tenant Settings Repository — Phase 2 (§20.7.8)
// One row per tenant in platform.tenant_settings, accessed via TenantPrismaService (RLS, ADR-008).

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { TenantPrismaService } from './prisma/tenant-prisma.service';

export interface TenantSettingsRow {
  tenant_id: string;
  variance_alert_threshold: string;
  retention_percentage: string;
  line_channel_token: string | null;
  notifications_enabled: boolean;
  updated_at: Date;
}

@Injectable({ scope: Scope.REQUEST })
export class TenantSettingsRepository {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }

  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) private readonly request: { tenantId?: string },
  ) {}

  async find(): Promise<TenantSettingsRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<TenantSettingsRow[]>`
        SELECT * FROM platform.tenant_settings WHERE tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async upsert(params: {
    variance_alert_threshold: string;
    retention_percentage: string;
    line_channel_token: string | null;
    notifications_enabled: boolean;
  }): Promise<TenantSettingsRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<TenantSettingsRow[]>`
        INSERT INTO platform.tenant_settings
          (tenant_id, variance_alert_threshold, retention_percentage,
           line_channel_token, notifications_enabled, updated_at)
        VALUES
          (${this.tenantId}::uuid, ${params.variance_alert_threshold}::decimal,
           ${params.retention_percentage}::decimal, ${params.line_channel_token},
           ${params.notifications_enabled}, now())
        ON CONFLICT (tenant_id) DO UPDATE SET
          variance_alert_threshold = EXCLUDED.variance_alert_threshold,
          retention_percentage     = EXCLUDED.retention_percentage,
          line_channel_token       = EXCLUDED.line_channel_token,
          notifications_enabled    = EXCLUDED.notifications_enabled,
          updated_at               = now()
        RETURNING *
      `,
    );
    return rows[0]!;
  }
}
