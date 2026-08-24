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
  /** 0 | 1, not boolean — ClickHouse `if()` returns UInt8. See §35.13 ESC-34. */
  atRisk: 0 | 1;
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

/** POST /procurement/purchase-requests (CreatePurchaseRequestDto). */
export interface CreatePurchaseRequestInput {
  project_id: string;
  pr_number: string;
  required_date?: string;
}

/** POST /procurement/rfqs (CreateRfqDto). */
export interface CreateRfqInput {
  project_id: string;
  pr_id?: string;
  rfq_number: string;
  deadline: string;
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

export interface PoLineItemRow {
  line_id: string;
  po_id: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
  line_total: string;
}

/** GET /procurement/purchase-orders/:poId — PO detail with its line items. */
export interface PurchaseOrderDetail {
  po: PurchaseOrderRow;
  line_items: PoLineItemRow[];
}

/** POST /procurement/deliveries (RecordDeliveryDto). */
export interface RecordDeliveryInput {
  po_id: string;
  delivery_note?: string;
  delivered_at: string;
  notes?: string;
  items: { line_id: string; quantity_received: string }[];
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
  blockers?: string;
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

// ── Safety Officer (§20.7.7) ─────────────────────────────────────────────────

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface IncidentRow {
  incident_id: string;
  project_id: string;
  task_id: string | null;
  incident_type: string;
  severity: IncidentSeverity;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  reported_by: string;
  created_at: string;
}

export interface CreateIncidentInput {
  project_id: string;
  incident_type: string;
  severity: IncidentSeverity;
  task_id?: string;
}

export type PermitType = 'WORK_PERMIT' | 'SAFETY_PERMIT' | 'DRAWING_APPROVAL' | 'ENTRY_PERMIT';

export interface PermitRow {
  permit_id: string;
  project_id: string;
  permit_type: PermitType;
  permit_number: string;
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  valid_until: string | null;
  linked_task_id: string | null;
  created_at: string;
}

export interface ComplianceSummary {
  open_incidents: number;
  high_critical_incidents: number;
  expired_permits: number;
  revoked_permits: number;
}

// ── Tenant Admin (§20.7.8) ───────────────────────────────────────────────────

export interface UserRow {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface UserListResponse {
  data: UserRow[];
  pagination: { limit: number; offset: number; page: number; total: number };
}

export interface CreateUserInput {
  display_name: string;
  role: string;
  email?: string;
  phone_number?: string;
}

export interface TenantSettings {
  variance_alert_threshold: string;
  retention_percentage: string;
  line_channel_token: string | null;
  notifications_enabled: boolean;
}

export interface UpdateTenantSettingsInput {
  variance_alert_threshold?: number;
  retention_percentage?: number;
  line_channel_token?: string;
  notifications_enabled?: boolean;
}

// ── System Admin (§20.4 / §20.7.11) ──────────────────────────────────────────

export type PlanType = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

/** Raw platform.tenants row (snake_case — returned by $queryRaw). */
export interface TenantRow {
  tenant_id: string;
  tenant_code: string;
  tenant_name: string;
  plan_type: PlanType;
  is_active: boolean;
  dedicated_db_url: string | null;
  created_at: string;
}

/** Create-tenant body (camelCase — matches CreateTenantDto). */
export interface CreateTenantInput {
  tenantCode: string;
  tenantName: string;
  planType: PlanType;
  dedicatedDbUrl?: string;
}

// ── CRM / Sales Manager (§20.7.10) ───────────────────────────────────────────

export interface LeadRow {
  lead_id: string;
  contact_name: string | null;
  company: string | null;
  status: 'NEW' | 'QUALIFIED' | 'DISQUALIFIED';
  source: string | null;
  created_at: string;
}

export interface CreateLeadInput {
  contact_name?: string;
  company?: string;
  source?: string;
}

export interface OpportunityRow {
  opportunity_id: string;
  lead_id: string;
  title: string;
  value: string | null;
  status: 'OPEN' | 'WON' | 'LOST';
  expected_close_date: string | null;
  created_at: string;
}

export interface CreateOpportunityInput {
  lead_id: string;
  title: string;
  value?: string;
  expected_close_date?: string;
}

export interface CrmCustomerRow {
  customer_id: string;
  opportunity_id: string | null;
  company_name: string;
  customer_type: string | null;
  status: string;
  created_at: string;
}

// ── Project risk register (ADR-065) ───────────────────────────────────────────

export type RiskCategory = 'SAFETY' | 'FINANCIAL' | 'SCHEDULE' | 'TECHNICAL' | 'EXTERNAL' | 'OTHER';
export type RiskStatus = 'OPEN' | 'MITIGATING' | 'CLOSED' | 'ACCEPTED';
export type RiskSource = 'MANUAL' | 'AI_SUGGESTED';

export interface RiskRow {
  risk_id: string;
  project_id: string;
  title: string;
  description: string | null;
  category: RiskCategory;
  likelihood: number;
  impact: number;
  risk_score: number;
  mitigation: string | null;
  owner: string | null;
  status: RiskStatus;
  source: RiskSource;
  created_at: string;
}

/** POST /api/v1/projects/:id/risks body (CreateRiskDto). */
export interface CreateRiskInput {
  title: string;
  description?: string;
  category: RiskCategory;
  likelihood: number;
  impact: number;
  mitigation?: string;
  owner?: string;
}

/** PATCH /api/v1/risks/:riskId body (UpdateRiskDto). */
export interface UpdateRiskInput {
  title?: string;
  description?: string;
  category?: RiskCategory;
  likelihood?: number;
  impact?: number;
  mitigation?: string;
  owner?: string;
}

// ─── Subject requests (ADR-090; PDPA-48) ────────────────────────────────────
// People with NO platform account — CRM contacts and leads, the named contact at a vendor. The
// TENANT is their controller and Construction OS the processor, so these routes serve the tenant's
// own compliance desk rather than a data subject.

export interface SubjectRequestRow {
  request_id: string;
  request_type: 'ACCESS' | 'ERASURE';
  subject_email: string | null;
  subject_phone: string | null;
  status: 'OPEN' | 'FULFILLED' | 'REJECTED';
  received_at: string;
  opened_at: string;
  closed_at: string | null;
  outcome_note: string | null;
  /** Proof that the subject controls the identifier on file — gates anonymisation. */
  verified_at: string | null;
}

export interface CreateSubjectRequestInput {
  request_type: 'ACCESS' | 'ERASURE';
  subject_email?: string;
  subject_phone?: string;
  received_at: string;
  note?: string;
}

export interface CloseSubjectRequestInput {
  status: 'FULFILLED' | 'REJECTED';
  outcome_note: string;
}

export interface EraseSubjectRequestInput {
  legal_hold?: boolean;
  legal_hold_reason?: string;
}

/** Only the @pdpa-tagged columns of the matched row, plus its id — never the whole row. */
export interface SubjectMatch {
  source: 'crm.contacts' | 'crm.leads' | 'procurement.vendors';
  id: string;
  fields: Record<string, string | null>;
}

export interface SubjectMatchResult {
  request_id: string;
  matches: SubjectMatch[];
  /** Set when nothing matched — an empty list is not the same as "nothing is held". */
  note: string | null;
}

export interface ErasureResult {
  request_id: string;
  anonymised: { contacts: number; leads: number; vendors: number };
  total: number;
  archived_file_id: string | null;
}
