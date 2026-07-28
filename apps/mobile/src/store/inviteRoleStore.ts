// Invite-role store — ephemeral hand-off of the role picked on the full-screen roles-selection screen
// back to the Invite-user form that pushed it (mockup 01_invite_user/03_roles_selection). expo-router's
// router.back() carries no return value, so roles-selection writes the chosen role here and invite-user
// consumes it on the next render, then clears it. Non-persisted (like uiStore) — never touches SecureStore.

import { create } from 'zustand';

interface InviteRoleState {
  /** The role CONFIRMed on roles-selection, awaiting pickup by invite-user (null once consumed). */
  pendingRole: string | null;
  setPendingRole: (role: string) => void;
  clearPendingRole: () => void;
}

export const useInviteRoleStore = create<InviteRoleState>((set) => ({
  pendingRole: null,
  setPendingRole: (role) => set({ pendingRole: role }),
  clearPendingRole: () => set({ pendingRole: null }),
}));
