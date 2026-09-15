/**
 * Pure helpers for SYSTEM_ADMIN System Settings (R17.22). The bounds are the backend's input bounds
 * (`backend/src/modules/platform-settings/dto/update-platform-settings.dto.ts` PLATFORM_SETTINGS_BOUNDS), repeated here
 * only so a typo is caught before the round trip; the API remains the authority and refuses anything past them.
 * They are not defaults and not recommendations.
 */

import type { PlanTier, PlatformSettings, TierLimits } from './api/adminSettings';

export const SETTINGS_BOUNDS = {
  TEXT_MAX: 200,
  URL_MAX: 2048,
  MAX_RETRIES: 100,
  HOURS_MAX: 8760,
  SHARED_TENANT_CAP_MAX: 1_000_000,
  POOL_CONNS_MAX: 10_000,
  STORAGE_QUOTA_GB_MAX: 1_000_000_000,
  MONTHLY_QUOTA_MAX: Number.MAX_SAFE_INTEGER,
} as const;

export type CountResult = { ok: true; value: number | null } | { ok: false };

/** A count field's text → `null` when blank, the integer when it is a whole number in [0, max], otherwise not ok. */
export function parseCount(text: string, max: number): CountResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (!/^\d+$/.test(trimmed)) return { ok: false };
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value <= max ? { ok: true, value } : { ok: false };
}

/** Blank text is "not set". */
export function textOrNull(text: string): string | null {
  return text.trim() === '' ? null : text.trim();
}

/** How full the shared tier is, 0-100, for the drawn bar — `null` when no cap is set. */
export function capShare(count: number, cap: number | null): number | null {
  if (cap === null) return null;
  if (cap === 0) return count > 0 ? 100 : 0;
  return Math.min(100, Math.round((count / cap) * 100));
}

/** The drawn select options, plus the stored value when it is none of them — a stored choice is never hidden. */
export function withStored<T extends string | number>(
  options: readonly T[],
  stored: T | null,
): T[] {
  return stored === null || options.includes(stored) ? [...options] : [...options, stored];
}

const emptyTier = (): TierLimits => ({
  db_strategy: null,
  storage_quota_gb: null,
  api_monthly_quota: null,
  token_limit_monthly: null,
});

/** The "nothing set" document — what Reset to defaults puts in the form (saved only by Save). Mirrors the backend's. */
export function emptySettings(): PlatformSettings {
  return {
    gateways: {
      primary: { name: null, url: null, protocol: null },
      secondary: { name: null, url: null, max_retries: null },
      auto_sync_cadence: null,
      failover_cache_ttl_hours: null,
      auto_fallback_on_timeout: null,
    },
    maintenance: { safety_non_suspension: null, shared_tiers_window: null, enterprise_mode: null },
    broadcast: { lead_time_hours: null, channels: [] },
    limits: { shared_tenant_cap: null, default_max_pool_conns: null },
    tiers: { STARTER: emptyTier(), PROFESSIONAL: emptyTier(), ENTERPRISE: emptyTier() },
  };
}

/** Whether two documents differ — key order is fixed by construction, so a structural compare is enough. */
export function settingsChanged(a: PlatformSettings, b: PlatformSettings): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export const TIER_ORDER: readonly PlanTier[] = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

const B = SETTINGS_BOUNDS;

/** Every whole-number field the form edits as text, with its bound. The failover TTL is a select, not listed. */
export const COUNT_FIELDS: ReadonlyArray<{ path: string; max: number }> = [
  { path: 'gateways.secondary.max_retries', max: B.MAX_RETRIES },
  { path: 'broadcast.lead_time_hours', max: B.HOURS_MAX },
  { path: 'limits.shared_tenant_cap', max: B.SHARED_TENANT_CAP_MAX },
  { path: 'limits.default_max_pool_conns', max: B.POOL_CONNS_MAX },
  ...TIER_ORDER.flatMap((tier) => [
    { path: `tiers.${tier}.storage_quota_gb`, max: B.STORAGE_QUOTA_GB_MAX },
    { path: `tiers.${tier}.api_monthly_quota`, max: B.MONTHLY_QUOTA_MAX },
    { path: `tiers.${tier}.token_limit_monthly`, max: B.MONTHLY_QUOTA_MAX },
  ]),
];

type Node = Record<string, unknown>;

function readPath(root: PlatformSettings, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node as Node)[key], root);
}

/** The text each count field starts from: its stored number, or blank when not set. */
export function countTexts(settings: PlatformSettings): Record<string, string> {
  return Object.fromEntries(
    COUNT_FIELDS.map(({ path }) => {
      const value = readPath(settings, path) as number | null;
      return [path, value === null ? '' : String(value)];
    }),
  );
}

/**
 * The document with every count field taken from its text, and the paths whose text is not a whole number within its
 * bound. The input document is not changed; a path missing from `texts` keeps its stored value.
 */
export function applyCounts(
  settings: PlatformSettings,
  texts: Record<string, string>,
): { settings: PlatformSettings; invalid: string[] } {
  const next = structuredClone(settings);
  const invalid: string[] = [];
  for (const { path, max } of COUNT_FIELDS) {
    const text = texts[path];
    if (text === undefined) continue;
    const parsed = parseCount(text, max);
    if (!parsed.ok) {
      invalid.push(path);
      continue;
    }
    const keys = path.split('.');
    const last = keys.pop() as string;
    const parent = keys.reduce<Node>((node, key) => node[key] as Node, next as unknown as Node);
    parent[last] = parsed.value;
  }
  return { settings: next, invalid };
}
