// User self-service API — GET /users/me, PATCH /users/me/photo (§14 User Management, self-service).
//
// Not cached offline: the header avatar's initials come from the persisted session (authStore
// displayName), so a failed fetch here costs the photo, never the whole header.

import { get, mutate, post } from './client';

export interface Me {
  user_id: string;
  email: string;
  display_name: string;
  /** File-service URL of the profile photo. Null → clients render initials (§11 platform.users). */
  photo_url: string | null;
  role: string;
}

export async function getMe(): Promise<Me> {
  return get<Me>('/users/me');
}

/** Set the profile photo, or pass null to clear it and go back to initials. */
export async function updateMyPhoto(photoUrl: string | null): Promise<void> {
  await mutate<Me>('PATCH', '/users/me/photo', { photo_url: photoUrl }, 'user-photo', 'me');
}

// ─── Tenant admin — user management (GET /users, TENANT_ADMIN only; spec §14.3) ───

export interface TenantUser {
  user_id: string;
  email: string | null;
  /** Path A (phone OTP) accounts have a phone; email-only (Path B) accounts do not. */
  phone_number: string | null;
  display_name: string;
  photo_url: string | null;
  role: string;
  mfa_enabled: boolean;
  is_active: boolean;
  /** Last authenticated request — ISO timestamp. Drives the User Audit (dormant > 30 days). */
  last_seen_at: string;
}

interface PaginatedUsers {
  data: TenantUser[];
  pagination: { limit: number; offset: number; page: number; total: number };
}

/** List the signed-in tenant's active users (newest first) — the TENANT_ADMIN "Users" tab. */
export async function getUsers(): Promise<TenantUser[]> {
  const res = await get<PaginatedUsers>('/users');
  return res.data;
}

/** Create/invite a user in the signed-in tenant (POST /users, TENANT_ADMIN only; §14.3). Path A
 *  supplies phone_number, Path B supplies email — mutually exclusive. Online-required (the backend
 *  provisions Keycloak + emits identity.user.created.v1); 409 if the identity already exists. */
export interface CreateUserInput {
  display_name: string;
  role: string;
  phone_number?: string;
  email?: string;
}

export async function createUser(input: CreateUserInput): Promise<TenantUser> {
  return post<TenantUser>('/users', input);
}
