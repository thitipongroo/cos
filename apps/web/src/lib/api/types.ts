/** Web-side mirrors of the backend response shapes consumed by operational pages. */

export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export interface ProjectRow {
  project_id: string;
  project_code: string;
  project_name: string;
  project_type: string;
  status: ProjectStatus;
  budget_amount: string | null;
  budget_currency: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface ProjectListResponse {
  items: ProjectRow[];
  nextCursor: string | null;
}

/** GET /api/v1/analytics/executive row (matches AnalyticsExecutiveController). */
export interface ExecutiveDashboardRow {
  projectId: string;
  totalCommitted: string;
  totalActual: string;
  totalBudget: string;
  utilizationPct: number;
  atRisk: boolean;
  overdueInvoiceCount: number;
}

export type IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface IssueRow {
  issue_id: string;
  project_id: string;
  title: string;
  description: string | null;
  severity: IssueSeverity;
  status: IssueStatus;
  created_at: string;
}

export interface IssueListResponse {
  items: IssueRow[];
  total: number;
  page: number;
  limit: number;
}

/** POST /api/v1/ai/reports/* response (ai-gateway ReportResponse). */
export interface AiReportResponse {
  report_id: string;
  report_type: string;
  content: Record<string, unknown>;
  confidence: number | null;
  low_confidence: boolean;
}

export type ProjectType = 'RESIDENTIAL' | 'COMMERCIAL' | 'INFRASTRUCTURE' | 'INDUSTRIAL';

/** POST /api/v1/projects body (CreateProjectDto). */
export interface CreateProjectInput {
  project_code: string;
  project_name: string;
  project_type: ProjectType;
  budget_amount?: string;
  budget_currency?: string;
  start_date?: string;
  end_date?: string;
}

export type ProjectTransitionTarget = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export interface ProjectMemberRow {
  membership_id: string;
  user_id: string;
  role: string;
  assigned_at: string;
}

export interface ProjectDocumentRow {
  document_id: string;
  file_id: string | null;
  document_type: string | null;
  uploaded_by: string;
  uploaded_at: string;
}

export interface BoqVersionRow {
  version_id: string;
  version_number: number;
  version_name: string | null;
  status: 'DRAFT' | 'APPROVED' | 'SUPERSEDED';
  total_estimated_amount: string;
  total_estimated_currency: string;
}

export interface ProjectBudgetRow {
  budget_id: string;
  total_budget_amount: string;
  total_budget_currency: string;
  allocated_amount: string;
  committed_amount: string;
  actual_amount: string;
}

export interface FinanceSummary {
  budget: ProjectBudgetRow;
  variance_percentage: string;
}

export interface PurchaseRequestRow {
  pr_id: string;
  pr_number: string;
  status: string;
  required_date: string | null;
}

export interface RfqRow {
  rfq_id: string;
  rfq_number: string;
  status: string;
  deadline: string;
}

export interface PurchaseOrderRow {
  po_id: string;
  po_number: string;
  status: string;
}

export interface SiteReportRow {
  report_id: string;
  project_id: string;
  report_date: string;
  status: 'DRAFT' | 'SUBMITTED' | 'ACKNOWLEDGED';
  summary: string | null;
  manpower_count: number | null;
}

export interface SiteReportListResponse {
  items: SiteReportRow[];
  total: number;
  page: number;
  limit: number;
}

// ── Procurement (§20.7.3) ─────────────────────────────────────────────────────

export interface VendorRow {
  vendor_id: string;
  vendor_code: string;
  vendor_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
}

export interface DeliveryRow {
  delivery_id: string;
  po_id: string;
  delivery_note: string | null;
  delivered_at: string;
  received_by: string;
}

export interface QuotationRow {
  quotation_id: string;
  rfq_id: string;
  vendor_id: string;
  total_amount: string;
  currency_code: string;
  validity_days: number;
  is_selected: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ProcurementListFilter {
  project_id?: string;
  status?: string;
}
