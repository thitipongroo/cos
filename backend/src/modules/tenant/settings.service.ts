// Tenant Settings Service — Phase 2 (§20.7.8)
// Returns the tenant's settings (defaults when no row exists yet) and applies partial updates.

import { Injectable } from '@nestjs/common';
import { TenantSettingsRepository } from './settings.repository';
import type { TenantSettingsRow } from './settings.repository';
import type { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';

export interface TenantSettings {
  variance_alert_threshold: string;
  retention_percentage: string;
  line_channel_token: string | null;
  notifications_enabled: boolean;
}

const DEFAULTS: TenantSettings = {
  variance_alert_threshold: '10.00',
  retention_percentage: '5.00',
  line_channel_token: null,
  notifications_enabled: true,
};

function project(row: TenantSettingsRow): TenantSettings {
  return {
    variance_alert_threshold: row.variance_alert_threshold,
    retention_percentage: row.retention_percentage,
    line_channel_token: row.line_channel_token,
    notifications_enabled: row.notifications_enabled,
  };
}

@Injectable()
export class TenantSettingsService {
  constructor(private readonly repo: TenantSettingsRepository) {}

  async getSettings(): Promise<TenantSettings> {
    const row = await this.repo.find();
    return row ? project(row) : { ...DEFAULTS };
  }

  async updateSettings(dto: UpdateTenantSettingsDto): Promise<TenantSettings> {
    const current = await this.getSettings();
    const merged = await this.repo.upsert({
      variance_alert_threshold:
        dto.variance_alert_threshold !== undefined
          ? dto.variance_alert_threshold.toFixed(2)
          : current.variance_alert_threshold,
      retention_percentage:
        dto.retention_percentage !== undefined
          ? dto.retention_percentage.toFixed(2)
          : current.retention_percentage,
      line_channel_token:
        dto.line_channel_token !== undefined ? dto.line_channel_token : current.line_channel_token,
      notifications_enabled:
        dto.notifications_enabled !== undefined
          ? dto.notifications_enabled
          : current.notifications_enabled,
    });
    return project(merged);
  }
}
