// Display logic for the PDPA export flow (ADR-078) — the part worth testing, kept out of the screens.
//
// THE ONE THING THIS FILE EXISTS TO PREVENT is the screen inventing a promise. The mockup's success
// state says the archive "will be sent to your email within 24 hours". No such SLA exists anywhere:
// the export is a Temporal workflow over every domain schema, PDPA §30 allows thirty days, and
// nothing in ADR-078 commits to a duration. So the screen reports the request's actual state, and
// this module is where that state becomes words.

// Types only from the api module — a VALUE import would pull in the axios client, the auth store and
// the sync queue, turning this pure module into something that cannot be unit-tested without mocking
// three native packages. The canonical category list therefore lives here and `api/dataExport`
// re-exports it, rather than the other way round.
import type { DataExportRequest } from '../api/dataExport';

/**
 * The platform's own @pdpa taxonomy (migration 20260803000001), shared with the consent screen.
 *
 * NOT the mockup's four rows ("Personal Identity / Attendance Logs / Activity History / Financial
 * Records"). ADR-078 rejected that list as invented for the design: the server validates against
 * `PDPA_CATEGORIES` with `@IsIn`, so a mockup category would simply 400 — and using the real
 * taxonomy means the export and the consent screen can never disagree about what a category is.
 */
export const EXPORT_CATEGORIES = [
  'identity',
  'contact',
  'location',
  'financial',
  'operational',
] as const;
export type ExportCategory = (typeof EXPORT_CATEGORIES)[number];

export const EXPORT_FORMATS = ['JSON', 'CSV'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** What the success/status screen should show for one request. */
export type ExportStage = 'QUEUED' | 'PREPARING' | 'READY' | 'FAILED' | 'EXPIRED';

export interface ExportDisplay {
  stage: ExportStage;
  /** True only when the SERVER says so. Never re-derived from status + expiry on the client. */
  canDownload: boolean;
  /** Whole days until the download expires; null when there is nothing to expire. */
  expiresInDays: number | null;
  /** The server's sentence when it failed, or null. Never a stack trace (ADR-078). */
  failureReason: string | null;
}

const STAGE_BY_STATUS: Record<DataExportRequest['status'], ExportStage> = {
  PENDING: 'QUEUED',
  PROCESSING: 'PREPARING',
  READY: 'READY',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
};

/**
 * Turn a request into what the screen renders.
 *
 * `canDownload` comes straight from the server's `downloadable`. The client could compute
 * "READY and not past expires_at", and it would be wrong the moment the two clocks disagree or the
 * archive is removed early — offering a download that 404s is worse than not offering one.
 */
export function describeExport(
  request: DataExportRequest,
  now: number = Date.now(),
): ExportDisplay {
  return {
    stage: STAGE_BY_STATUS[request.status],
    canDownload: request.downloadable,
    expiresInDays: daysUntil(request.expiresAt, now),
    failureReason: request.failureReason,
  };
}

/**
 * Whole days from now until an ISO timestamp, floored, never negative; null for a missing date.
 *
 * Floored downwards on purpose: "expires in 6 days" for something with 6.9 days left understates by
 * hours, while rounding up would tell someone they have a day they do not have.
 */
export function daysUntil(iso: string | null, now: number = Date.now()): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((at - now) / 86_400_000));
}

/**
 * Toggle a category in the selection, preserving the canonical order.
 *
 * Order is preserved rather than append-on-select because the request is echoed back on the status
 * screen, and a list that reorders itself as the user taps reads as though the platform changed
 * something. `ArrayUnique` on the server rejects duplicates, so the set semantics matter too.
 */
export function toggleCategory(
  selected: readonly ExportCategory[],
  category: ExportCategory,
): ExportCategory[] {
  const next = new Set(selected);
  if (next.has(category)) next.delete(category);
  else next.add(category);
  return EXPORT_CATEGORIES.filter((c) => next.has(c));
}

/**
 * Can this request be submitted?
 *
 * Mirrors the server's own validation (`@ArrayNotEmpty`, `@IsIn`, and the inverted-window check that
 * answers 422 COS-PDPA-003) so the button is disabled instead of the request being rejected. The
 * server still validates — this is a courtesy, not the control.
 */
export function canSubmitExport(input: {
  categories: readonly ExportCategory[];
  format: ExportFormat | null;
  fromDate?: string | null;
  toDate?: string | null;
}): boolean {
  if (input.categories.length === 0) return false;
  if (!input.format) return false;
  if (input.fromDate && input.toDate && input.fromDate > input.toDate) return false;
  return true;
}

/**
 * Is a step-up code complete enough to submit?
 *
 * Six digits, matching the server's OTP length. Deliberately not "any six characters": a pasted
 * code with a stray space would be sent, rejected, and count against the attempt limit that locks
 * the user out of their own §30 request.
 */
export function isCompleteStepUpCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}
