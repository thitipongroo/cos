'use client';

import { TenantListScreen } from '../../../../components/admin/TenantList';

/**
 * `/admin/tenants/new` — Create Tenant (§20.4.2). Since R13 (product owner, 2026-09-15) Create Tenant is the Stitch
 * "Create Tenant - Modal Overlay - SYSTEM_ADMIN" dialog over the Tenant List, so this route renders the list with the
 * modal open; closing it goes to `/admin`. The form itself is <CreateTenantModal />.
 */
export default function CreateTenantPage() {
  return <TenantListScreen createOpen />;
}
