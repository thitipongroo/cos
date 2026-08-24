// Tenant settings — GET/PATCH /tenant/settings (TENANT_ADMIN). Powers the External Integrations
// section of the settings screen: the LINE notification toggle + channel token are real and persisted
// here. variance/retention are surfaced by other admin screens; kept on the type for completeness.

import { get, mutate } from './client';

export interface TenantSettings {
  variance_alert_threshold: string;
  retention_percentage: string;
  line_channel_token: string | null;
  notifications_enabled: boolean;
}

export type TenantSettingsPatch = Partial<{
  line_channel_token: string | null;
  notifications_enabled: boolean;
  variance_alert_threshold: number;
  retention_percentage: number;
}>;

export async function getSettings(): Promise<TenantSettings> {
  return get<TenantSettings>('/tenant/settings');
}

// Settings are online-required; mutate() performs the PATCH and only falls back to the offline queue
// when the device is offline. We do not use the response body — the screen updates optimistically.
export async function updateSettings(patch: TenantSettingsPatch): Promise<void> {
  await mutate('PATCH', '/tenant/settings', patch, 'tenant-settings', 'me');
}
