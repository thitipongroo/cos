// Tenant store — the signed-in user's own tenant as GET /tenant last answered it (§7.10, ADR-109). Ephemeral and
// not persisted: <TrialBanner /> fills it on launch and on reconnect, and the sync runner refreshes it when a push
// is refused because the trial ended. Everything that must know "may this tenant write?" reads it from here —
// `useTenantReadOnly` — rather than each asking the server.

import { create } from 'zustand';
import type { MyTenant } from '../api/tenant';

interface TenantState {
  tenant: MyTenant | null;
  setTenant: (tenant: MyTenant | null) => void;
}

export const useTenantStore = create<TenantState>((set) => ({
  tenant: null,
  setTenant: (tenant) => set({ tenant }),
}));
