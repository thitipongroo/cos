// Role RBAC — reads the authoritative permission matrix (spec §6.4) from the backend so the invite
// flow's "role permissions" screen shows a real access breakdown, not a hard-coded one.
// GET /auth/roles/:role/permissions returns the static resource:action grant set for a CosRole.

import { get } from './client';

export interface RolePermissions {
  role: string;
  /** Granted permissions as `resource:action` (e.g. `project:write`, `finance:read`, `*:*`). */
  permissions: string[];
}

export async function getRolePermissions(role: string): Promise<RolePermissions> {
  return get<RolePermissions>(`/auth/roles/${encodeURIComponent(role)}/permissions`);
}
