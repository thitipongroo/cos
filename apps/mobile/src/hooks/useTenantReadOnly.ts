// True while the tenant's free trial has ended (EXPIRED or PENDING_DELETION, §7.10): every write would be refused
// with 403 COS-PLAN-003, so the app stops offering them — <Fab /> renders nothing — and <TrialBanner /> says why.
// Unknown (not read yet, offline at launch) is NOT read-only: the server still decides, and the sync queue holds
// anything it refuses rather than losing it.

import { isReadOnlyStatus } from '@cos/ui-logic';
import { useTenantStore } from '../store/tenantStore';

export function useTenantReadOnly(): boolean {
  return useTenantStore((s) => isReadOnlyStatus(s.tenant?.subscription_status));
}
