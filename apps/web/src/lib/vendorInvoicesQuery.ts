/**
 * The query string for `GET /procurement/vendor-invoices` (plan DC).
 *
 * `projectId` asks for that project's invoices only (their PO's project) — the payments page passes the chosen
 * project, so an invoice of another project cannot be picked (plan DB refused such a pair after the fact).
 */
export function vendorInvoicesQuery(status: string, projectId?: string): string {
  const qs = new URLSearchParams({ limit: '100' });
  if (status) qs.set('status', status);
  if (projectId) qs.set('project_id', projectId);
  return qs.toString();
}
