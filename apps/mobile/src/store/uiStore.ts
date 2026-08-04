// UI store — ephemeral, non-persisted view state shared across the shell. Currently the navigation
// drawer's open/closed flag, driven by the TopBar hamburger and consumed by <NavigationDrawer />
// (mockup/mobile/04_tenant_admin/05_navigation_drawer). Kept out of authStore/localeStore because it
// is neither auth nor locale and must never persist to SecureStore.

import { create } from 'zustand';

interface UiState {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  drawerOpen: false,
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
}));
