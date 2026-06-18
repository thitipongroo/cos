'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useApi } from './client';
import type {
  BoqVersionRow,
  CreateProjectInput,
  DeliveryRow,
  ExecutiveDashboardRow,
  FinanceInvoiceRow,
  FinanceSummary,
  IssueListResponse,
  PaginatedResponse,
  PaymentRow,
  ProcurementListFilter,
  RecordPaymentInput,
  VarianceRow,
  ProjectDocumentRow,
  ProjectListResponse,
  ProjectMemberRow,
  ProjectRow,
  ProjectTransitionTarget,
  PurchaseOrderRow,
  PurchaseRequestRow,
  QuotationRow,
  RfqRow,
  SiteReportListResponse,
  VendorRow,
} from './types';

function filterQuery(filter: ProcurementListFilter): string {
  const params = new URLSearchParams({ limit: '100' });
  if (filter.project_id) {
    params.set('project_id', filter.project_id);
  }
  if (filter.status) {
    params.set('status', filter.status);
  }
  return params.toString();
}

/** Project list (tenant-scoped server-side via JWT/RLS). */
export function useProjects() {
  const api = useApi();
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api<ProjectListResponse>('/projects?limit=100'),
  });
}

/** Executive analytics for the given projects/date window (§20.7.1). */
export function useExecutiveDashboard(projectIds: string[], dateRange: string) {
  const api = useApi();
  const { data: session } = useSession();
  const tenantId = session?.user?.tenantId ?? '';
  return useQuery({
    queryKey: ['executive', tenantId, projectIds, dateRange],
    enabled: projectIds.length > 0 && tenantId !== '',
    queryFn: () => {
      const params = new URLSearchParams({ tenantId, dateRange });
      projectIds.forEach((id) => params.append('projectIds[]', id));
      return api<ExecutiveDashboardRow[]>(`/analytics/executive?${params.toString()}`);
    },
  });
}

/** Open CRITICAL issues across the tenant — feeds the executive alerts page. */
export function useCriticalIssues() {
  const api = useApi();
  return useQuery({
    queryKey: ['issues', 'critical'],
    queryFn: () => api<IssueListResponse>('/issues?severity=CRITICAL&status=OPEN&limit=100'),
  });
}

// ── Project detail (§20.7.2) ──────────────────────────────────────────────────

export function useProject(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['project', id],
    enabled: id !== '',
    queryFn: () => api<ProjectRow>(`/projects/${id}`),
  });
}

export function useProjectMembers(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['project', id, 'members'],
    enabled: id !== '',
    queryFn: () => api<ProjectMemberRow[]>(`/projects/${id}/members`),
  });
}

export function useProjectDocuments(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['project', id, 'documents'],
    enabled: id !== '',
    queryFn: () => api<ProjectDocumentRow[]>(`/projects/${id}/documents`),
  });
}

export function useBoqVersions(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['project', id, 'boq'],
    enabled: id !== '',
    queryFn: () => api<BoqVersionRow[]>(`/projects/${id}/boq/versions`),
  });
}

export function useFinanceSummary(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['project', id, 'finance'],
    enabled: id !== '',
    queryFn: () => api<FinanceSummary>(`/finance/budget/${id}`),
  });
}

export function useProjectProcurement(id: string) {
  const api = useApi();
  // Per ADR-022 / §14 there are no project-scoped procurement lists; the PM
  // per-project view uses the tenant-wide endpoints filtered by project_id.
  const prs = useQuery({
    queryKey: ['project', id, 'prs'],
    enabled: id !== '',
    queryFn: () =>
      api<PaginatedResponse<PurchaseRequestRow>>(`/procurement/purchase-requests?project_id=${id}`),
  });
  const rfqs = useQuery({
    queryKey: ['project', id, 'rfqs'],
    enabled: id !== '',
    queryFn: () => api<PaginatedResponse<RfqRow>>(`/procurement/rfqs?project_id=${id}`),
  });
  const pos = useQuery({
    queryKey: ['project', id, 'pos'],
    enabled: id !== '',
    queryFn: () =>
      api<PaginatedResponse<PurchaseOrderRow>>(`/procurement/purchase-orders?project_id=${id}`),
  });
  return { prs, rfqs, pos };
}

export function useProjectSiteReports(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['project', id, 'site-reports'],
    enabled: id !== '',
    queryFn: () => api<SiteReportListResponse>(`/site-reports?project_id=${id}&limit=50`),
  });
}

export function useProjectIssues(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['project', id, 'issues'],
    enabled: id !== '',
    queryFn: () => api<IssueListResponse>(`/issues?project_id=${id}&status=OPEN&limit=50`),
  });
}

export function useCreateProject() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      api<ProjectRow>('/projects', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useTransitionProject(id: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { to: ProjectTransitionTarget; reason?: string }) =>
      api<ProjectRow>(`/projects/${id}/transitions`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }),
  });
}

// ── Procurement (§20.7.3) — tenant-wide AIP-132 lists ─────────────────────────

export function useVendors() {
  const api = useApi();
  return useQuery({
    queryKey: ['vendors'],
    queryFn: () => api<VendorRow[]>('/procurement/vendors'),
  });
}

export function useAllPurchaseRequests(filter: ProcurementListFilter) {
  const api = useApi();
  return useQuery({
    queryKey: ['purchase-requests', filter],
    queryFn: () =>
      api<PaginatedResponse<PurchaseRequestRow>>(
        `/procurement/purchase-requests?${filterQuery(filter)}`,
      ),
  });
}

export function useAllRfqs(filter: ProcurementListFilter) {
  const api = useApi();
  return useQuery({
    queryKey: ['rfqs', filter],
    queryFn: () => api<PaginatedResponse<RfqRow>>(`/procurement/rfqs?${filterQuery(filter)}`),
  });
}

export function useAllPurchaseOrders(filter: ProcurementListFilter) {
  const api = useApi();
  return useQuery({
    queryKey: ['purchase-orders', filter],
    queryFn: () =>
      api<PaginatedResponse<PurchaseOrderRow>>(
        `/procurement/purchase-orders?${filterQuery(filter)}`,
      ),
  });
}

export function useAllDeliveries(poId: string) {
  const api = useApi();
  const qs = new URLSearchParams({ limit: '100' });
  if (poId) {
    qs.set('po_id', poId);
  }
  return useQuery({
    queryKey: ['deliveries', poId],
    queryFn: () => api<PaginatedResponse<DeliveryRow>>(`/procurement/deliveries?${qs.toString()}`),
  });
}

export function useQuotations(rfqId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['quotations', rfqId],
    enabled: rfqId !== '',
    queryFn: () => api<QuotationRow[]>(`/procurement/rfqs/${rfqId}/quotations`),
  });
}

export function useAwardRfq(rfqId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (quotation_id: string) =>
      api<void>(`/procurement/rfqs/${rfqId}/award`, {
        method: 'POST',
        body: JSON.stringify({ quotation_id }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotations', rfqId] }),
  });
}

// ── Finance (§20.7.4) ─────────────────────────────────────────────────────────

export function usePayments(projectId: string) {
  const api = useApi();
  const qs = new URLSearchParams({ limit: '100' });
  if (projectId) {
    qs.set('project_id', projectId);
  }
  return useQuery({
    queryKey: ['payments', projectId],
    queryFn: () => api<PaginatedResponse<PaymentRow>>(`/finance/payments?${qs.toString()}`),
  });
}

export function useVarianceReport() {
  const api = useApi();
  return useQuery({
    queryKey: ['finance', 'variance'],
    queryFn: () => api<VarianceRow[]>('/finance/reports/variance'),
  });
}

/** Finance AP invoice queue — vendor invoices owned by procurement (ADR-023). */
export function useFinanceInvoices(status: string) {
  const api = useApi();
  const qs = new URLSearchParams({ limit: '100' });
  if (status) {
    qs.set('status', status);
  }
  return useQuery({
    queryKey: ['finance', 'invoices', status],
    queryFn: () =>
      api<PaginatedResponse<FinanceInvoiceRow>>(`/procurement/vendor-invoices?${qs.toString()}`),
  });
}

export function useRecordPayment() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordPaymentInput) =>
      api<PaymentRow>('/finance/payments', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments'] }),
  });
}

export function useApproveInvoice() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) =>
      api<void>(`/procurement/vendor-invoices/${invoiceId}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance', 'invoices'] }),
  });
}
