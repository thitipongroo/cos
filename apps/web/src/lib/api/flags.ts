'use client';

/**
 * React binding for server-evaluated feature flags (QM-15; ADR-049).
 *
 * Thin by design — all decision logic lives in `src/lib/flags.ts`, which the node-only jest config
 * covers to 100%. This file only wires that logic to React Query, matching how the rest of
 * `src/lib/api/` is structured (covered by Playwright, not unit tests).
 */

import { useQuery } from '@tanstack/react-query';
import { useApi } from './client';
import { FLAGS_REFETCH_MS, isFlagEnabled, parseFlagsResponse } from '../flags';

/** The whole server-evaluated flag map for the calling user/tenant. */
export function useFlags() {
  const api = useApi();
  return useQuery({
    queryKey: ['flags'],
    queryFn: async () => parseFlagsResponse(await api<unknown>('/flags')),
    // Kill-switch budget (QM-15 ≤60s): 15s backend Unleash poll + 30s here = 45s worst case.
    // staleTime matches the interval so a remount inside the window reuses the cached map instead
    // of firing an extra request per form.
    refetchInterval: FLAGS_REFETCH_MS,
    staleTime: FLAGS_REFETCH_MS,
  });
}

/**
 * Resolve a single flag.
 *
 * Returns the fallback while the first fetch is in flight and if it fails — for
 * `s1.web.client-validation` that is `false`, i.e. server-only validation. Callers get a plain
 * boolean and never need to branch on loading state.
 */
export function useFlag(name: string): boolean {
  const { data } = useFlags();
  return isFlagEnabled(data, name);
}
