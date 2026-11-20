// signOutByChoice — the sign-out a person asks for (plan CV).
//
// Product owner, 2026-11-20: a sign-out the user chooses (the drawer's Log out, the biometric lock's Sign out)
// forgets the active project, so the next person on a shared handset picks their own. A session that ends by
// itself (api/client.ts: no refresh token, a failed refresh) goes through `authStore.logout()` alone and keeps
// it, so the same worker signing back in is not asked again. Only the active project: the read caches and the
// per-user outbox keep their own rule (sync/deviceOwner.ts — cleared when a different user signs in).

import { useAuthStore } from './authStore';
import { useProjectStore } from './projectStore';

export async function signOutByChoice(): Promise<void> {
  // Forgotten in memory first and the session ended at once, so the signed-in shell never renders without a
  // project while storage is being written (found by /doubt); the stored copy is removed after.
  useProjectStore.setState({ active: null, pickerOpen: false });
  await useAuthStore.getState().logout();
  try {
    await useProjectStore.getState().clear();
  } catch {
    // Best-effort: a storage failure must not undo the sign-out. A stored copy left behind is still dropped if a
    // different user signs in next.
  }
}
