'use client';

/**
 * SYSTEM_ADMIN audit-log reads (R17.4 / R17.6; §20.4.6 as answered 2026-09-15, decisions D3 / D4). Every call is itself
 * written to `platform.audit_logs` by the backend (`audit.read` / `audit.export`), so these hooks never poll.
 *
 * Shapes are declared once in `@cos/types` (admin-api.ts), shared with the backend; contract in `docs/api/tenant.openapi.yaml`.
 * `to` is EXCLUSIVE and a date without a time is 00:00 UTC; `today` in the summary is counted from 00:00 UTC.
 */

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useCallback } from 'react';
import { auditQuery } from '../adminAudit';
import { API_BASE, ApiError, useApi } from './client';
import type { AuditLogPage, AuditLogSummary, TenantAuditLogPage } from '@cos/types';

export type { AuditLogPage, AuditLogRow, AuditLogSummary, TenantAuditLogPage } from '@cos/types';

export interface AuditLogFilters {
  tenantId?: string;
  actorId?: string;
  /** Exact action, or a prefix when it ends in `.` (e.g. `tenant.`). */
  action?: string;
  /** ISO date or date-time, inclusive. */
  from?: string;
  /** ISO date or date-time, exclusive. */
  to?: string;
  q?: string;
}

export const AUDIT_PAGE_SIZE = 50;

export function useTenantAuditLogs(tenantId: string, q: string, cursor: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['admin', 'audit', 'tenant', tenantId, q, cursor],
    queryFn: () =>
      api<TenantAuditLogPage>(
        `/admin/tenants/${tenantId}/audit-logs${auditQuery({ q, cursor, limit: AUDIT_PAGE_SIZE })}`,
      ),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useGlobalAuditLogs(filters: AuditLogFilters, cursor: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['admin', 'audit', 'global', filters, cursor],
    queryFn: () =>
      api<AuditLogPage>(
        `/admin/audit-logs${auditQuery({ ...filters, cursor, limit: AUDIT_PAGE_SIZE })}`,
      ),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useAuditSummary(range: { from?: string; to?: string }) {
  const api = useApi();
  return useQuery({
    queryKey: ['admin', 'audit', 'summary', range],
    queryFn: () => api<AuditLogSummary>(`/admin/audit-logs/summary${auditQuery(range)}`),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/**
 * Download an export as a file. The request carries the session's bearer token, so a plain link cannot do it; the
 * response body becomes an object URL clicked once and revoked.
 */
export function useAuditExport(): (path: string, filename: string) => Promise<void> {
  const { data } = useSession();
  const token = data?.accessToken;
  return useCallback(
    async (path: string, filename: string) => {
      const headers = new Headers();
      if (token) headers.set('authorization', `Bearer ${token}`);
      const res = await fetch(`${API_BASE}${path}`, { headers });
      if (!res.ok) throw new ApiError(res.status, `Request failed: ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
    [token],
  );
}
