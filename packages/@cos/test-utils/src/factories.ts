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
