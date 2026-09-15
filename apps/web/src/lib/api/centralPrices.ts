'use client';

/**
 * SYSTEM_ADMIN Central Price Register reads and writes (R17.13–R17.15; ADR-061). Shapes are declared once in `@cos/types` (admin-api.ts), shared with the backend; contract in `docs/api/central-prices.openapi.yaml`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { auditQuery } from '../adminAudit';
import { useApi, useUpload } from './client';
import type {
  CentralPriceListResponse,
  ImportResult,
  SyncRun,
  SyncStatusResponse,
} from '@cos/types';

export type {
  CentralPriceListResponse,
  CentralPriceRow,
  CentralPriceSource,
  CentralPriceStatus,
  ImportResult,
  SyncRun,
  SyncRunKind,
  SyncRunOutcome,
  SyncStatusResponse,
} from '@cos/types';

export const CENTRAL_PRICE_PAGE_SIZE = 50;

const KEY = ['admin', 'central-prices'] as const;

export function useCentralPrices(period: string | undefined, cursor: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...KEY, 'list', period ?? null, cursor],
    queryFn: () =>
      api<CentralPriceListResponse>(
        `/admin/central-prices${auditQuery({ effective_period: period, cursor, limit: CENTRAL_PRICE_PAGE_SIZE })}`,
      ),
    refetchOnWindowFocus: false,
  });
}

export function useCentralPriceSyncStatus() {
  const api = useApi();
  return useQuery({
    queryKey: [...KEY, 'sync-status'],
    queryFn: () => api<SyncStatusResponse>('/admin/central-prices/sync-status'),
    refetchOnWindowFocus: false,
  });
}

export interface ImportCentralPricesInput {
  file: File;
  effective_period: string;
  source_ref: string;
  justification: string;
}

export function useImportCentralPrices() {
  const upload = useUpload();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportCentralPricesInput) => {
      const form = new FormData();
      form.append('effective_period', input.effective_period);
      if (input.source_ref.trim()) form.append('source_ref', input.source_ref);
      form.append('justification', input.justification);
      form.append('file', input.file);
      return upload<ImportResult>('/admin/central-prices/import', form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSyncCentralPrices() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (justification: string) =>
      api<SyncRun>('/admin/central-prices/sync', {
        method: 'POST',
        body: JSON.stringify({ justification }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
