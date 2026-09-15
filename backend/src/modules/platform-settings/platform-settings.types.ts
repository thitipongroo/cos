// Platform-wide settings — the document SYSTEM_ADMIN reads and saves on System Settings (ADR-108).
//
// STORED ONLY. Nothing in this repository reads these values to change behaviour: no gateway client, no
// scheduler, no throttler, no pool and no quota check consults them. They are what the Stitch
// "System Settings - SYSTEM_ADMIN" screen draws, kept so the operator's choices persist and every change
// is audited. A consumer is a later decision (ADR-108 §Consequences).
//
// EVERY FIELD IS NULLABLE, AND null MEANS "NOT SET". The defaults below are all null or empty on purpose:
// the drawing prints figures (retry counts, TTLs, quotas) that no specification or measurement in this
// repository backs, and a default is a claim. The operator enters a number; the system never invents one.

// The document's shapes live in @cos/types (client-safe) so the web panel and this module share one declaration.
export {
  BROADCAST_CHANNELS,
  PLAN_TIERS,
  type BroadcastChannel,
  type PlanTier,
  type PlatformSettings,
  type PlatformSettingsActor,
  type PlatformSettingsResponse,
  type TierLimits,
} from '@cos/types';
import type { PlatformSettings, TierLimits } from '@cos/types';

/** `audit_logs.action` for a saved change. */
export const PLATFORM_SETTINGS_AUDIT_ACTION = 'platform.settings.update';
/** `audit_logs.resource_type` for a saved change. */
export const PLATFORM_SETTINGS_RESOURCE_TYPE = 'platform_settings';

const emptyTier = (): TierLimits => ({
  db_strategy: null,
  storage_quota_gb: null,
  api_monthly_quota: null,
  token_limit_monthly: null,
});

/** A fresh "nothing set" document. A function, so no caller can mutate a shared default. */
export function defaultPlatformSettings(): PlatformSettings {
  return {
    gateways: {
      primary: { name: null, url: null, protocol: null },
      secondary: { name: null, url: null, max_retries: null },
      auto_sync_cadence: null,
      failover_cache_ttl_hours: null,
      auto_fallback_on_timeout: null,
    },
    maintenance: {
      safety_non_suspension: null,
      shared_tiers_window: null,
      enterprise_mode: null,
    },
    broadcast: { lead_time_hours: null, channels: [] },
    limits: { shared_tenant_cap: null, default_max_pool_conns: null },
    tiers: { STARTER: emptyTier(), PROFESSIONAL: emptyTier(), ENTERPRISE: emptyTier() },
  };
}
