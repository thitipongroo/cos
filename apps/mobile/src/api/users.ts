// User self-service API — GET /users/me, PATCH /users/me/photo (§14 User Management, self-service).
//
// Not cached offline: the header avatar's initials come from the persisted session (authStore
// displayName), so a failed fetch here costs the photo, never the whole header.

import { get, mutate } from './client';

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
