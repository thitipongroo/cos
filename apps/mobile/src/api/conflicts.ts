// Sync conflict records — the Tenant Admin "Alerts" sync-review queue (mockup 04_tenant_admin/03_alerts).
// GET /site/conflict-records lists unresolved field-sync conflicts (client vs server payload); TENANT-ADMIN
// (and SITE_ENGINEER/PM) can view/resolve them (spec §17.5, site-ops.controller). PATCH .../resolve marks
// one resolved. This is the SAME endpoint the SITE_ENGINEER ConflictBadge review uses — no new backend.

import { get, mutate } from './client';

export type ConflictType = 'FIELD_CONFLICT' | 'STATUS_CONFLICT' | 'REJECTED';

export interface ConflictRecord {
  conflict_id: string;
  entity_type: string;
  entity_id: string;
  conflict_type: ConflictType;
  client_payload: Record<string, unknown> | null;
  server_payload: Record<string, unknown> | null;
  created_at: string;
}

export async function getConflictRecords(): Promise<ConflictRecord[]> {
  const res = await get<{ items?: ConflictRecord[] } | ConflictRecord[]>('/site/conflict-records');
  return Array.isArray(res) ? res : (res.items ?? []);
}

export async function resolveConflict(conflictId: string): Promise<void> {
  await mutate(
    'PATCH',
    `/site/conflict-records/${conflictId}/resolve`,
    { resolution_note: 'resolved from admin sync queue' },
    'conflict',
    conflictId,
  );
}
