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

// ── Finance (§20.7.4) ─────────────────────────────────────────────────────────

export interface PaymentRow {
  payment_id: string;
  invoice_id: string;
  project_id: string;
  amount: string;
  currency_code: string;
  payment_date: string;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  payment_reference: string | null;
}

export interface VarianceRow {
  project_id: string;
  allocated: string;
  committed: string;
  actual: string;
  variance_percentage: string;
  over_budget: boolean;
}

/** Vendor invoice (AP) — owned by procurement, viewed/approved by Finance. */
export interface FinanceInvoiceRow {
  invoice_id: string;
  po_id: string;
  vendor_id: string;
  invoice_number: string;
  amount: string;
  currency_code: string;
  status: 'RECEIVED' | 'VERIFIED' | 'APPROVED' | 'PAID' | 'DISPUTED';
  due_date: string;
}

export interface RecordPaymentInput {
  project_id: string;
  invoice_id: string;
  amount: string;
  currency_code: string;
  payment_date: string;
  payment_reference?: string;
}

// ── Site Engineer (§20.7.5) ──────────────────────────────────────────────────

export type InspectionStatus = 'PENDING' | 'PASSED' | 'FAILED' | 'REQUIRES_REINSPECTION';

export interface InspectionRow {
  inspection_id: string;
  project_id: string;
  checklist_id: string;
  status: InspectionStatus;
  inspected_by: string;
  inspected_at: string;
  notes: string | null;
}

export interface UpdateInspectionInput {
  status: 'PASSED' | 'FAILED' | 'REQUIRES_REINSPECTION';
  notes?: string;
}

export interface ConflictRecordRow {
  conflict_id: string;
  entity_type: string;
  entity_id: string;
  conflict_type: 'FIELD_CONFLICT' | 'STATUS_CONFLICT' | 'REJECTED';
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

// ── Site Worker (§20.7.6) ────────────────────────────────────────────────────

export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'CANCELLED';

export interface TaskRow {
  task_id: string;
  project_id: string;
  task_name: string;
  work_type: string;
  status: TaskStatus;
  progress_percent: number;
  assigned_to: string | null;
  planned_end: string | null;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  progress_percent?: number;
}

export interface SafetyChecklistRow {
  checklist_id: string;
  project_id: string;
  checklist_name: string;
  version: number;
}

export interface CreateSiteReportInput {
  project_id: string;
  report_date: string;
  summary?: string;
  manpower_count?: number;
  weather?: string;
}

export interface CreateIssueInput {
  project_id: string;
  title: string;
  description?: string;
  severity: IssueSeverity;
}

export interface UploadedFileResult {
  file_id: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: string;
}
