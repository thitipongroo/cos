// The signed-in user's own tenant identity — GET /tenant (name + code + plan). Powers the Tenant Admin
// settings screen's Organization Info. Self-service (scoped by the JWT tenant_id, any authenticated role).

import { get } from './client';

export interface MyTenant {
  tenant_name: string;
  tenant_code: string;
  plan_type: string;
}

export async function getMyTenant(): Promise<MyTenant> {
  return get<MyTenant>('/tenant');
}
