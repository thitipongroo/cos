'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useApi } from './client';
import type {
  BoqVersionRow,
  CreateProjectInput,
  ExecutiveDashboardRow,
  FinanceSummary,
  IssueListResponse,
  ProjectDocumentRow,
  ProjectListResponse,
  ProjectMemberRow,
  ProjectRow,
  ProjectTransitionTarget,
  PurchaseOrderRow,
  PurchaseRequestRow,
  RfqRow,
  SiteReportListResponse,
} from './types';

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
    queryFn: () => api<FinanceSummary>(`/projects/${id}/finance/summary`),
  });
}

export function useProjectProcurement(id: string) {
  const api = useApi();
  const prs = useQuery({
    queryKey: ['project', id, 'prs'],
    enabled: id !== '',
    queryFn: () => api<PurchaseRequestRow[]>(`/projects/${id}/purchase-requests`),
  });
  const rfqs = useQuery({
    queryKey: ['project', id, 'rfqs'],
    enabled: id !== '',
    queryFn: () => api<RfqRow[]>(`/projects/${id}/rfqs`),
  });
  const pos = useQuery({
    queryKey: ['project', id, 'pos'],
    enabled: id !== '',
    queryFn: () => api<PurchaseOrderRow[]>(`/projects/${id}/purchase-orders`),
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
