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
  /**
   * `platform.users.mfa_enabled` — whether this account has a second factor enrolled.
   *
   * Declared 2026-09-08. The endpoint has always returned it (`user.service.ts` `getMe` selects it
   * by name); this type simply did not say so. OPTIONAL for QM-9: an app pointed at an older
   * deployment parses the response either way, and the drawer draws nothing rather than claiming
   * a factor that may not exist.
   */
  mfa_enabled?: boolean;
  /**
   * `workforce.workers.employee_code` — the employer's own identifier for the person.
   *
   * NULL IS THE COMMON CASE for the roles that read finance screens, and `user.service.ts` says so
   * in as many words: the worker link only exists for site workers, and office roles legitimately
   * have no code. Callers fall back to a short form of the UUID rather than showing a gap.
   */
  employee_code?: string | null;
  /**
   * `platform.users.position` — the person's job title, free text (ADR-101, 2026-09-08).
   *
   * The drawer's position line used to be DRAWN: `PROFILE_JOB_TITLE`, one hardcoded string for the
   * whole app. This column replaced it and the register entry was deleted.
   *
   * OPTIONAL FOR QM-9, and the optionality is doing real work here rather than being ceremony: an
   * app shipped against a deployment that predates migration `20260908000001` gets no such key, and
   * the drawer must draw nothing rather than a gap or a placeholder. NULL is also the ORDINARY case
   * on a current deployment — no route sets a position; it arrives by seed or HR import.
   */
  position?: string | null;
  /**
   * `platform.users.phone_number` — the Path A login identifier, null on a Path B account.
   *
   * Declared 2026-09-13. `getMe` has selected it by name since the route existed; this type simply
   * did not say so. OPTIONAL FOR QM-9, and it decides two things rather than one:
   *   - the profile screen prints it as a READ-ONLY field (PO decision E6 — it is the identifier a
   *     Path A account signs in with, and §5.4.4 gives an account one identifier for its lifetime);
   *   - together with `email` it is how the client tells the paths apart, which is what the Password
   *     row keys off (ADR-104). No new field was needed for that.
   */
  phone_number?: string | null;
  /**
   * `platform.users.password_changed_at` — when a password was last set THROUGH THE API.
   *
   * NULL IS THE ORDINARY CASE AND WILL STAY THAT WAY (ADR-104): the self-service flow completes
   * inside Keycloak and calls nothing back, so only an admin temporary reset writes this. Callers
   * print NOTHING when it is absent or null — never "never", which reads as a fact about the
   * password rather than about what this column can see. ISO 8601 on the wire.
   */
  password_changed_at?: string | null;
}

export async function getMe(): Promise<Me> {
  return get<Me>('/users/me');
}

/**
 * Ask for an email link to set your own password (POST /users/me/password-reset-email; ADR-104).
 *
 * Keycloak sends a single-use, 15-minute UPDATE_PASSWORD action token — the user sets the password
 * there and COS never handles it. NOT offline-queued: a reset link replayed hours later from a queue
 * would arrive already expired, and the caller needs the refusal below in the moment it is given.
 *
 * PATH B ONLY. A phone/OTP account has no email and no password, and the backend refuses it with
 * `COS-AUTH-003` rather than reporting a send. The screen does not offer the row on such an account,
 * so this rejection is the second line of defence, not the first.
 */
export async function requestMyPasswordResetEmail(): Promise<{ email: string }> {
  return post<{ email: string }>('/users/me/password-reset-email', {});
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
