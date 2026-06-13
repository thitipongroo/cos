import { randomUUID } from 'crypto';

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export interface TenantSeed {
  id: string;
  name: string;
  slug: string;
  tier: 'SHARED' | 'DEDICATED' | 'SELF_HOSTED';
  active: boolean;
  created_at: Date;
}

export interface UserSeed {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: string;
  created_at: Date;
}

export interface ProjectSeed {
  id: string;
  tenant_id: string;
  name: string;
  status: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
  budget: number;
  currency: string;
  created_at: Date;
}

export interface DocumentSeed {
  id: string;
  tenant_id: string;
  project_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  storage_key: string;
  uploaded_by: string;
  created_at: Date;
}

export interface InvoiceSeed {
  id: string;
  tenant_id: string;
  project_id: string;
  vendor_id: string;
  amount: number;
  currency: string;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED';
  due_date: Date;
  created_at: Date;
}

export function buildTenant(overrides: Partial<TenantSeed> = {}): TenantSeed {
  return {
    id: randomUUID(),
    name: `Test Tenant ${Date.now()}`,
    slug: `test-tenant-${Date.now()}`,
    tier: 'SHARED',
    active: true,
    created_at: new Date(),
    ...overrides,
  };
}

export function buildUser(tenantId: string, overrides: Partial<UserSeed> = {}): UserSeed {
  return {
    id: randomUUID(),
    tenant_id: tenantId,
    email: `user-${Date.now()}@example.com`,
    name: `Test User ${Date.now()}`,
    role: 'PROJECT_MANAGER',
    created_at: new Date(),
    ...overrides,
  };
}

export function buildProject(tenantId: string, overrides: Partial<ProjectSeed> = {}): ProjectSeed {
  return {
    id: randomUUID(),
    tenant_id: tenantId,
    name: `Test Project ${Date.now()}`,
    status: 'ACTIVE',
    budget: 1_000_000,
    currency: 'THB',
    created_at: new Date(),
    ...overrides,
  };
}

export function buildDocument(
  tenantId: string,
  projectId: string,
  userId: string,
  overrides: Partial<DocumentSeed> = {},
): DocumentSeed {
  const id = randomUUID();
  return {
    id,
    tenant_id: tenantId,
    project_id: projectId,
    name: `test-doc-${Date.now()}.pdf`,
    mime_type: 'application/pdf',
    size_bytes: 102_400,
    storage_key: `${tenantId}/${projectId}/${id}.pdf`,
    uploaded_by: userId,
    created_at: new Date(),
    ...overrides,
  };
}

export function buildInvoice(
  tenantId: string,
  projectId: string,
  overrides: Partial<InvoiceSeed> = {},
): InvoiceSeed {
  return {
    id: randomUUID(),
    tenant_id: tenantId,
    project_id: projectId,
    vendor_id: randomUUID(),
    amount: 50_000,
    currency: 'THB',
    status: 'PENDING',
    due_date: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    created_at: new Date(),
    ...overrides,
  };
}

// ── Domain request DTO factories (factory_bot pattern — minimal required fields only) ──────────

export interface CreateProjectDto {
  project_code: string;
  project_name: string;
  project_type: string;
  budget_amount: string;
  budget_currency: string;
  start_date: string;
  end_date: string;
}

export function buildCreateProjectDto(overrides: Partial<CreateProjectDto> = {}): CreateProjectDto {
  const ts = Date.now();
  return {
    project_code: `PRJ-${ts}`,
    project_name: `Test Project ${ts}`,
    project_type: 'COMMERCIAL',
    budget_amount: '5000000.0000',
    budget_currency: 'THB',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    ...overrides,
  };
}

export interface CreateVendorDto {
  vendor_code: string;
  vendor_name: string;
  contact_email: string;
}

export function buildCreateVendorDto(overrides: Partial<CreateVendorDto> = {}): CreateVendorDto {
  const ts = Date.now();
  return {
    vendor_code: `VND-${ts}`,
    vendor_name: `Test Vendor ${ts}`,
    contact_email: `vendor-${ts}@example.com`,
    ...overrides,
  };
}

export interface CreatePurchaseRequestDto {
  pr_number: string;
  required_date: string;
}

export function buildCreatePurchaseRequestDto(
  overrides: Partial<CreatePurchaseRequestDto> = {},
): CreatePurchaseRequestDto {
  return {
    pr_number: `PR-${Date.now()}`,
    required_date: '2026-12-31',
    ...overrides,
  };
}

export interface CreateRfqDto {
  project_id: string;
  rfq_number: string;
}

export function buildCreateRfqDto(
  projectId: string,
  overrides: Partial<CreateRfqDto> = {},
): CreateRfqDto {
  return {
    project_id: projectId,
    rfq_number: `RFQ-${Date.now()}`,
    ...overrides,
  };
}

export interface CreatePurchaseOrderDto {
  vendor_id: string;
  project_id: string;
  po_number: string;
}

export function buildCreatePurchaseOrderDto(
  vendorId: string,
  projectId: string,
  overrides: Partial<CreatePurchaseOrderDto> = {},
): CreatePurchaseOrderDto {
  return {
    vendor_id: vendorId,
    project_id: projectId,
    po_number: `PO-${Date.now()}`,
    ...overrides,
  };
}

export interface CreateBoqItemDto {
  category_id: string;
  description: string;
  unit: string;
  quantity: string;
}

export function buildCreateBoqItemDto(
  categoryId: string,
  overrides: Partial<CreateBoqItemDto> = {},
): CreateBoqItemDto {
  return {
    category_id: categoryId,
    description: 'Test BOQ item',
    unit: 'm3',
    quantity: '1.0000',
    ...overrides,
  };
}

export interface SetBudgetDto {
  total_budget_amount: string;
  total_budget_currency: string;
}

export function buildSetBudgetDto(overrides: Partial<SetBudgetDto> = {}): SetBudgetDto {
  return {
    total_budget_amount: '1000000.0000',
    total_budget_currency: 'THB',
    ...overrides,
  };
}

export interface CreateSiteReportDto {
  project_id: string;
  report_date: string;
}

export function buildCreateSiteReportDto(
  projectId: string,
  overrides: Partial<CreateSiteReportDto> = {},
): CreateSiteReportDto {
  return {
    project_id: projectId,
    report_date: new Date().toISOString().split('T')[0],
    ...overrides,
  };
}

export interface CreateWorkerDto {
  employee_code: string;
  full_name: string;
  trade_type: string;
  employment_type: string;
}

export function buildCreateWorkerDto(overrides: Partial<CreateWorkerDto> = {}): CreateWorkerDto {
  const ts = Date.now();
  return {
    employee_code: `EMP-${ts}`,
    full_name: `Test Worker ${ts}`,
    trade_type: 'Carpenter',
    employment_type: 'PERMANENT',
    ...overrides,
  };
}

export interface CreateCheckInDto {
  project_id: string;
  check_in_at: string;
}

export function buildCreateCheckInDto(
  projectId: string,
  overrides: Partial<CreateCheckInDto> = {},
): CreateCheckInDto {
  return {
    project_id: projectId,
    check_in_at: new Date().toISOString(),
    ...overrides,
  };
}

export interface NotificationPreferenceDto {
  event_type: string;
  channel: string;
  is_enabled: boolean;
}

export function buildNotificationPreferenceDto(
  overrides: Partial<NotificationPreferenceDto> = {},
): NotificationPreferenceDto {
  return {
    event_type: 'site.inspection.failed.v1',
    channel: 'IN_APP',
    is_enabled: true,
    ...overrides,
  };
}

export interface RegisterDeviceDto {
  push_token: string;
  platform: string;
}

export function buildRegisterDeviceDto(
  overrides: Partial<RegisterDeviceDto> = {},
): RegisterDeviceDto {
  return {
    push_token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    platform: 'IOS',
    ...overrides,
  };
}
