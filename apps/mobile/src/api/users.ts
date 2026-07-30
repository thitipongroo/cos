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
  /** Org unit for HR (nullable — set by seed/HR, not required at account creation). */
  department: string | null;
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
/** A user's primary role + additional roles (multi-role, union model). */
export interface UserRoles {
  primary_role: string;
  additional_roles: string[];
}
export async function getUserRoles(userId: string): Promise<UserRoles> {
  return get<UserRoles>(`/users/${userId}/roles`);
}
export async function setUserRoles(
  userId: string,
  primaryRole: string,
  additionalRoles: string[],
): Promise<void> {
  await mutate<void>(
    'PUT',
    `/users/${userId}/roles`,
    { primary_role: primaryRole, additional_roles: additionalRoles },
    'user-roles',
    userId,
  );
}

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

/** Result of an admin password reset — the plaintext temporary password is returned ONCE. */
export interface PasswordResetResult {
  temporary_password: string;
  display_name: string;
}

/** Admin-reset a user's password (POST /users/:id/reset-password, TENANT_ADMIN only; §14.3). Online-only
 *  (not offline-queued): the backend sets a temporary password on the Keycloak account — the user must
 *  choose a new one at next sign-in — and returns the plaintext ONCE for secure manual hand-off. */
export async function resetUserPassword(userId: string): Promise<PasswordResetResult> {
  return post<PasswordResetResult>(`/users/${userId}/reset-password`, {});
}

/** Email the user a standards-compliant password-reset link (POST /users/:id/reset-password/email,
 *  TENANT_ADMIN only; §14.3). Keycloak sends a single-use, 15-minute UPDATE_PASSWORD action-token email —
 *  the user sets their own password. Online-only; 400 if the user has no email on file. */
export async function sendResetLinkEmail(userId: string): Promise<{ email: string }> {
  return post<{ email: string }>(`/users/${userId}/reset-password/email`, {});
}
