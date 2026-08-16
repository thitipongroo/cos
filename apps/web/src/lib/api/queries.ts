'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useApi } from './client';
import type {
  BoqVersionRow,
  CreateProjectInput,
  RiskRow,
  RiskStatus,
  CreateRiskInput,
  UpdateRiskInput,
  DeliveryRow,
  PurchaseOrderDetail,
  RecordDeliveryInput,
  CreatePurchaseRequestInput,
  CreateRfqInput,
  ExecutiveDashboardRow,
  FinanceInvoiceRow,
  FinanceSummary,
  IssueListResponse,
  IssueRow,
  InspectionRow,
  ConflictRecordRow,
  UpdateInspectionInput,
  TaskRow,
  UpdateTaskInput,
  SafetyChecklistRow,
  CreateSiteReportInput,
  CreateIssueInput,
  SiteReportRow,
  IncidentRow,
  CreateIncidentInput,
  PermitRow,
  ComplianceSummary,
  UserListResponse,
  UserRow,
  CreateUserInput,
  TenantSettings,
  UpdateTenantSettingsInput,
  TenantRow,
  CreateTenantInput,
  LeadRow,
  CreateLeadInput,
  OpportunityRow,
  CreateOpportunityInput,
  CrmCustomerRow,
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
  SubjectRequestRow,
  CreateSubjectRequestInput,
  CloseSubjectRequestInput,
  EraseSubjectRequestInput,
  SubjectMatchResult,
  ErasureResult,
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
      projectIds.forEach((id) => params.append('projectIds', id));
      return api<ExecutiveDashboardRow[]>(`/analytics/executive?${params.toString()}`);
    },
  });
}

/** Open CRITICAL issues across the tenant — feeds the executive alerts page. */
export function useCriticalIssues() {
  const api = useApi();
  return useQuery({
    queryKey: ['issues', 'critical'],
    queryFn: () => api<IssueListResponse>('/site/issues?severity=CRITICAL&status=OPEN&limit=100'),
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
    queryFn: () => api<SiteReportListResponse>(`/site/reports?project_id=${id}&limit=50`),
  });
}

export function useProjectIssues(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['project', id, 'issues'],
    enabled: id !== '',
    queryFn: () => api<IssueListResponse>(`/site/issues?project_id=${id}&status=OPEN&limit=50`),
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

export interface VendorScoreResult {
  vendorId: string;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
  totalScore: number | null;
}

/** Vendor scorecard grade (§20.7.3 "vendor scoring"; G-W5 → GET /vendors/:id/score). */
export function useVendorScore(vendorId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['vendor-score', vendorId],
    enabled: vendorId !== '',
    queryFn: () => api<VendorScoreResult>(`/procurement/vendors/${vendorId}/score`),
  });
}

export function useCreatePurchaseRequest() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseRequestInput) =>
      api<PurchaseRequestRow>('/procurement/purchase-requests', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-requests'] }),
  });
}

export function useCreateRfq() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRfqInput) =>
      api<RfqRow>('/procurement/rfqs', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rfqs'] }),
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

export type PoApprovalTier = 'PM' | 'FINANCE' | 'EXECUTIVE' | 'TENANT_ADMIN';

/** PO lifecycle (§20.7.3): DRAFT→submit→PENDING_APPROVAL→approve({tier})/reject({reason}). */
export function useSubmitPo() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (poId: string) =>
      api<void>(`/procurement/purchase-orders/${poId}/submit`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });
}

export function useApprovePo() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { poId: string; tier: PoApprovalTier }) =>
      api<void>(`/procurement/purchase-orders/${v.poId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ tier: v.tier }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });
}

export function useRejectPo() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { poId: string; reason: string }) =>
      api<void>(`/procurement/purchase-orders/${v.poId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: v.reason }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
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

/** PO detail + line items, for recording a delivery (§20.7.3). */
export function usePurchaseOrder(poId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['purchaseOrder', poId],
    enabled: poId !== '',
    queryFn: () => api<PurchaseOrderDetail>(`/procurement/purchase-orders/${poId}`),
  });
}

/** Record/receive a delivery against a PO (§20.7.3 → POST /procurement/deliveries). */
export function useRecordDelivery() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordDeliveryInput) =>
      api<DeliveryRow>('/procurement/deliveries', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deliveries'] }),
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

/** RFQ lifecycle transitions (§20.7.3): publish (DRAFT→PUBLISHED), close/cancel (PUBLISHED→…).
 *  All are POST with no body. */
function useRfqTransition(action: 'publish' | 'close' | 'cancel') {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rfqId: string) =>
      api<void>(`/procurement/rfqs/${rfqId}/${action}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rfqs'] }),
  });
}

export const usePublishRfq = () => useRfqTransition('publish');
export const useCloseRfq = () => useRfqTransition('close');
export const useCancelRfq = () => useRfqTransition('cancel');

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

/** Approve a pending AP payment (§20.7.4 → PATCH /finance/payments/:id/approve). */
export function useApprovePayment() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) =>
      api<PaymentRow>(`/finance/payments/${paymentId}/approve`, { method: 'PATCH' }),
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

/** Dispute a vendor invoice (§20.7.4; G-W6 → POST /procurement/vendor-invoices/:id/dispute). */
export function useDisputeInvoice() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) =>
      api<void>(`/procurement/vendor-invoices/${invoiceId}/dispute`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance', 'invoices'] }),
  });
}

// ── Site Engineer (§20.7.5) ──────────────────────────────────────────────────

export function useSiteReports() {
  const api = useApi();
  return useQuery({
    queryKey: ['site', 'reports'],
    queryFn: () => api<SiteReportListResponse>('/site/reports?limit=50'),
  });
}

export function useIssues(status?: string) {
  const api = useApi();
  const qs = status ? `&status=${status}` : '';
  return useQuery({
    queryKey: ['site', 'issues', status ?? 'all'],
    queryFn: () => api<IssueListResponse>(`/site/issues?limit=100${qs}`),
  });
}

export function useInspections(status?: string) {
  const api = useApi();
  const qs = status ? `&status=${status}` : '';
  return useQuery({
    queryKey: ['site', 'inspections', status ?? 'all'],
    queryFn: () => api<PaginatedResponse<InspectionRow>>(`/site/inspections?limit=100${qs}`),
  });
}

/** Escalate an issue to the PM (§20.7.5; G-M12 → POST /site/issues/:id/escalate). */
export function useEscalateIssue() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (issueId: string) =>
      api<void>(`/site/issues/${issueId}/escalate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site', 'issues'] }),
  });
}

export function useUpdateInspection() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateInspectionInput }) =>
      api<InspectionRow>(`/site/inspections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site', 'inspections'] }),
  });
}

export function useConflictRecords() {
  const api = useApi();
  return useQuery({
    queryKey: ['site', 'conflicts'],
    queryFn: () => api<ConflictRecordRow[]>('/site/conflict-records'),
  });
}

export function useResolveConflict() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conflictId: string) =>
      api<void>(`/site/conflict-records/${conflictId}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({ resolution: 'MANUAL' }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site', 'conflicts'] }),
  });
}

// ── Site Worker (§20.7.6) ────────────────────────────────────────────────────

export function useTasks(projectId: string, assignedTo?: string) {
  const api = useApi();
  const qs = assignedTo ? `&assigned_to=${assignedTo}` : '';
  return useQuery({
    queryKey: ['tasks', projectId, assignedTo ?? 'all'],
    queryFn: () => api<PaginatedResponse<TaskRow>>(`/projects/${projectId}/tasks?limit=100${qs}`),
    enabled: !!projectId,
  });
}

export function useUpdateTask() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      api<TaskRow>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useCreateSiteReport() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSiteReportInput) =>
      api<SiteReportRow>('/site/reports', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site', 'reports'] }),
  });
}

export function useCreateIssue() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIssueInput) =>
      api<IssueRow>('/site/issues', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site', 'issues'] }),
  });
}

export function useChecklists(projectId?: string) {
  const api = useApi();
  const qs = projectId ? `?project_id=${projectId}` : '';
  return useQuery({
    queryKey: ['safety', 'checklists', projectId ?? 'all'],
    queryFn: () => api<SafetyChecklistRow[]>(`/safety/checklists${qs}`),
  });
}

// ── Safety Officer (§20.7.7) ─────────────────────────────────────────────────

export function useIncidents(status?: string) {
  const api = useApi();
  const qs = status ? `&status=${status}` : '';
  return useQuery({
    queryKey: ['safety', 'incidents', status ?? 'all'],
    queryFn: () => api<PaginatedResponse<IncidentRow>>(`/safety/incidents?limit=100${qs}`),
  });
}

export function useReportIncident() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIncidentInput) =>
      api<IncidentRow>('/safety/incidents', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'incidents'] }),
  });
}

export function useAcknowledgeIncident() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (incidentId: string) =>
      api<IncidentRow>(`/safety/incidents/${incidentId}/acknowledge`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'incidents'] }),
  });
}

export function usePermits(status?: string) {
  const api = useApi();
  const qs = status ? `&status=${status}` : '';
  return useQuery({
    queryKey: ['safety', 'permits', status ?? 'all'],
    queryFn: () => api<PaginatedResponse<PermitRow>>(`/safety/permits?limit=100${qs}`),
  });
}

export function useApprovePermit() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tier }: { id: string; tier: string }) =>
      api<PermitRow>(`/safety/permits/${id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ tier }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'permits'] }),
  });
}

export function useRejectPermit() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<PermitRow>(`/safety/permits/${id}/reject`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'permits'] }),
  });
}

export function useCompliance() {
  const api = useApi();
  return useQuery({
    queryKey: ['safety', 'compliance'],
    queryFn: () => api<ComplianceSummary>('/safety/compliance'),
  });
}

// ── Tenant Admin (§20.7.8) ───────────────────────────────────────────────────

export function useUsers() {
  const api = useApi();
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api<UserListResponse>('/users?limit=100'),
  });
}

export function useCreateUser() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      api<UserRow>('/users', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useChangeUserRole() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api<void>(`/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeactivateUser() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/users/${id}/deactivate`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useTenantSettings() {
  const api = useApi();
  return useQuery({
    queryKey: ['tenant', 'settings'],
    queryFn: () => api<TenantSettings>('/tenant/settings'),
  });
}

export function useUpdateTenantSettings() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTenantSettingsInput) =>
      api<TenantSettings>('/tenant/settings', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', 'settings'] }),
  });
}

// ── System Admin (§20.4 / §20.7.11) ──────────────────────────────────────────

export function useTenants() {
  const api = useApi();
  return useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: () => api<TenantRow[]>('/admin/tenants'),
  });
}

export function useCreateTenant() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTenantInput) =>
      api<TenantRow>('/admin/tenants', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tenants'] }),
  });
}

export function useDeactivateTenant() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/tenants/${id}/deactivate`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tenants'] }),
  });
}

export function useAssignDedicatedDb() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dedicatedDbUrl }: { id: string; dedicatedDbUrl: string }) =>
      api<void>(`/admin/tenants/${id}/dedicated-db`, {
        method: 'PATCH',
        body: JSON.stringify({ dedicatedDbUrl }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tenants'] }),
  });
}

// §20.4.4 — Mark an ENTERPRISE tenant as contracted → triggers EnterpriseProvisioningWorkflow.
export function useMarkContracted() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, contractReference }: { id: string; contractReference?: string }) =>
      api<void>(`/admin/tenants/${id}/mark-contracted`, {
        method: 'PATCH',
        body: JSON.stringify(contractReference ? { contractReference } : {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tenants'] }),
  });
}

// ── CRM / Sales Manager (§20.7.10) ───────────────────────────────────────────

export function useCrmLeads() {
  const api = useApi();
  return useQuery({
    queryKey: ['crm', 'leads'],
    queryFn: () => api<LeadRow[]>('/crm/leads'),
  });
}

export function useCreateLead() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeadInput) =>
      api<LeadRow>('/crm/leads', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'leads'] }),
  });
}

export function useCrmOpportunities() {
  const api = useApi();
  return useQuery({
    queryKey: ['crm', 'opportunities'],
    queryFn: () => api<OpportunityRow[]>('/crm/opportunities'),
  });
}

export function useCreateOpportunity() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOpportunityInput) =>
      api<OpportunityRow>('/crm/opportunities', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'opportunities'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads'] });
    },
  });
}

export function useConvertOpportunity() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<CrmCustomerRow>(`/crm/opportunities/${id}/convert`, { method: 'PATCH' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'opportunities'] });
      qc.invalidateQueries({ queryKey: ['crm', 'customers'] });
    },
  });
}

export function useCrmCustomers() {
  const api = useApi();
  return useQuery({
    queryKey: ['crm', 'customers'],
    queryFn: () => api<CrmCustomerRow[]>('/crm/customers'),
  });
}

// ── Project risk register (ADR-065, §20:426) ──────────────────────────────────

export function useProjectRisks(id: string, filters?: { status?: string; category?: string }) {
  const api = useApi();
  const qs = new URLSearchParams();
  if (filters?.status) qs.set('status', filters.status);
  if (filters?.category) qs.set('category', filters.category);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return useQuery({
    queryKey: ['project', id, 'risks', filters?.status ?? '', filters?.category ?? ''],
    enabled: id !== '',
    queryFn: () => api<RiskRow[]>(`/projects/${id}/risks${suffix}`),
  });
}

export function useRaiseRisk(id: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRiskInput) =>
      api<RiskRow>(`/projects/${id}/risks`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id, 'risks'] }),
  });
}

export function useUpdateRisk(id: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ riskId, input }: { riskId: string; input: UpdateRiskInput }) =>
      api<RiskRow>(`/risks/${riskId}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id, 'risks'] }),
  });
}

export function useTransitionRiskStatus(id: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ riskId, status }: { riskId: string; status: RiskStatus }) =>
      api<RiskRow>(`/risks/${riskId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id, 'risks'] }),
  });
}

// ─── Subject requests (ADR-090; PDPA-48) ────────────────────────────────────
// TENANT_ADMIN only. The request row is the authorisation to search: `useSubjectMatches` is enabled
// only once a request id is chosen, so opening the page never runs a lookup on its own.

export function useSubjectRequests(status?: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['subject-requests', status ?? 'all'],
    queryFn: () =>
      api<SubjectRequestRow[]>(`/subject-requests${status ? `?status=${status}` : ''}`),
  });
}

export function useCreateSubjectRequest() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubjectRequestInput) =>
      api<SubjectRequestRow>('/subject-requests', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subject-requests'] }),
  });
}

/**
 * What the tenant holds about the subject of one request.
 *
 * `enabled` is what keeps this from being a lookup tool: with no request selected the query never
 * fires, and the identifiers it searches on come from the row on the server, not from this client.
 * Each call writes an audit row server-side, so it is deliberately NOT refetched on window focus.
 */
export function useSubjectMatches(requestId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['subject-requests', requestId, 'matches'],
    queryFn: () => api<SubjectMatchResult>(`/subject-requests/${requestId}/matches`),
    enabled: requestId !== null,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function useEraseSubjectRequest() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, input }: { requestId: string; input: EraseSubjectRequestInput }) =>
      api<ErasureResult>(`/subject-requests/${requestId}/erase`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subject-requests'] }),
  });
}

export function useCloseSubjectRequest() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, input }: { requestId: string; input: CloseSubjectRequestInput }) =>
      api<SubjectRequestRow>(`/subject-requests/${requestId}/close`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subject-requests'] }),
  });
}

/**
 * Send the verification challenge (ADR-090 §6).
 *
 * Takes no address: the server picks it from the MATCHED RECORD, which is the whole point — a
 * client-supplied address would prove control of a claimed address and nothing more.
 */
export function useSendSubjectVerification() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) =>
      api<{ sent_to: string }>(`/subject-requests/${requestId}/verify`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subject-requests'] }),
  });
}
