// Photo-gallery logic (§32.7 "<PhotoCapture /> — Camera + gallery grid") — the unit-testable half
// of the gallery inside <PhotoCapture />.
//
// Same split as loadingState.ts: RN components are excluded from the QM-1 100% gate (jest.config.ts
// collectCoverageFrom omits src/components/**, and react-native is mocked wholesale so a component
// cannot be rendered under jest at all). The decisions therefore live here, where they are covered.

import type { UploadStatus } from '../db/schema';

/** Columns in the gallery grid. Three, matching the mockup's `grid-cols-3`. */
export const GALLERY_COLUMNS = 3;

/**
 * Whether the field user may delete this photo from the device.
 *
 * Deleting is deliberately NOT the mockup's unconditional X button, because two independent
 * constraints forbid it once a photo has reached the server:
 *
 *  1. `DELETE /api/v1/files/{file_id}` is **Tenant Admin** only (spec §14, API table). <PhotoCapture />
 *     is mounted on field screens (deliveries / inspections / issues), so its user is not a Tenant
 *     Admin and has no right to remove a stored file.
 *  2. The offline queue cannot even express the intent — `SyncOperation` is `'CREATE' | 'UPDATE'`
 *     (src/db/sync-queue.ts). There is no DELETE to enqueue.
 *
 * So deletion is confined to photos whose bytes never reached the server, where it is a purely local
 * operation with no server-side consequence:
 *
 *  - `PENDING`   — queued, not yet sent. Safe.
 *  - `FAILED`    — upload gave up after MAX_RETRIES; no server file exists. Safe, and the only way a
 *                  user can clear a photo (and its annotation) that is permanently stuck — the
 *                  stranded-annotation case ADR-056 accepts as a known gap.
 *  - `UPLOADING` — in flight. Deleting mid-request races the upload and could orphan a server file.
 *  - `UPLOADED`  — a server file exists; see (1).
 */
export function canDeletePhoto(status: UploadStatus): boolean {
  return status === 'PENDING' || status === 'FAILED';
}
