/**
 * Feature-flag reading for the web client (QM-15; ADR-049).
 *
 * Flags are server-evaluated: the browser polls `GET /api/v1/flags` and never holds Unleash
 * credentials. This module is the pure half — payload parsing and enabled/disabled resolution —
 * so it can carry the 100% QM-1 gate under the node-only jest config. The React binding lives in
 * `src/lib/api/flags.ts`.
 *
 * Registry: docs/registers/feature-flag-registry.md
 */

/** Client-side form validation via `@cos/schemas` + react-hook-form (docs/registers/feature-flag-registry.md). */
export const FLAG_WEB_CLIENT_VALIDATION = 's1.web.client-validation';

/**
 * How often the browser refetches the flag map.
 *
 * QM-15 requires a kill switch to take effect within 60s without a deployment. The backend polls
 * Unleash every 15s (`REFRESH_INTERVAL_MS` in feature-flag.service.ts), so 30s here puts the
 * worst-case end-to-end propagation at 45s — inside the bound with margin for one lost poll.
 */
export const FLAGS_REFETCH_MS = 30_000;

/**
 * What a flag resolves to when the flag endpoint has not answered (yet, or at all).
 *
 * `s1.web.client-validation` is **fail-closed**, unlike the server-side retrofit kill-switches
 * which are fail-open. Off means forms mount without a resolver and submit straight to the API,
 * where `class-validator` still rejects bad input (QM-4) — that is the behaviour that shipped
 * before this flag existed, so a flag-service outage degrades to the known-good path rather than
 * enabling half-rolled-out validation.
 */
export const FLAG_FALLBACKS: Readonly<Record<string, boolean>> = {
  [FLAG_WEB_CLIENT_VALIDATION]: false,
};

/** Shape of `GET /api/v1/flags`. */
export interface FlagsResponse {
  flags: Record<string, boolean>;
}

/**
 * Narrow an untrusted `GET /api/v1/flags` body to a flag map.
 *
 * Anything unexpected yields `{}` rather than throwing, so a malformed or proxied response falls
 * through to `FLAG_FALLBACKS` instead of breaking every form on the page. Non-boolean entries are
 * dropped individually — a single bad value must not discard the flags that parsed correctly.
 */
export function parseFlagsResponse(payload: unknown): Record<string, boolean> {
  if (typeof payload !== 'object' || payload === null) {
    return {};
  }
  const { flags } = payload as { flags?: unknown };
  if (typeof flags !== 'object' || flags === null) {
    return {};
  }
  const parsed: Record<string, boolean> = {};
  for (const [name, value] of Object.entries(flags as Record<string, unknown>)) {
    if (typeof value === 'boolean') {
      parsed[name] = value;
    }
  }
  return parsed;
}

/**
 * Resolve one flag, falling back to `FLAG_FALLBACKS` when the map has no entry for it.
 *
 * A flag absent from both is `false`: an unknown flag key is a bug, and the safe reading of a bug
 * is "feature off".
 */
export function isFlagEnabled(flags: Record<string, boolean> | undefined, name: string): boolean {
  return flags?.[name] ?? FLAG_FALLBACKS[name] ?? false;
}
