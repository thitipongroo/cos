'use client';

/**
 * SYSTEM_ADMIN platform settings (R17.20 / R17.22; ADR-108). `GET` and `PUT /admin/settings` — shapes are declared once in `@cos/types` (admin-api.ts), shared with the backend; contract in `docs/api/platform-settings.openapi.yaml`.
 * STORED ONLY: nothing reads these values to change behaviour. Every field is nullable and null means "not set".
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from './client';
import type { PlatformSettings, PlatformSettingsResponse } from '@cos/types';

export {
  BROADCAST_CHANNELS,
  PLAN_TIERS,
  type BroadcastChannel,
  type PlanTier,
  type PlatformSettings,
  type PlatformSettingsResponse,
  type TierLimits,
} from '@cos/types';

export interface UpdatePlatformSettingsInput {
  version: number;
  justification: string;
  settings: PlatformSettings;
}

const KEY = ['admin', 'settings'] as const;

export function usePlatformSettings() {
  const api = useApi();
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<PlatformSettingsResponse>('/admin/settings'),
    refetchOnWindowFocus: false,
  });
}

export function useUpdatePlatformSettings() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePlatformSettingsInput) =>
      api<PlatformSettingsResponse>('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: (saved) => qc.setQueryData(KEY, saved),
  });
}
