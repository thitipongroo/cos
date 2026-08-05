// PDPA §30 access / §31 portability — the subject exporting their own data (ADR-078).
//
// Three calls, in the order the flow uses them: step up, request, then poll. The step-up pair lives
// here rather than in auth.ts because it is not an auth primitive from the client's side — it is the
// first half of this feature, and the action token it produces is useless anywhere else.

import { apiClient, get, post } from './client';

// The taxonomy and the formats are defined in ../lib/dataExport and re-exported here for callers
// that already import this module. They live there, not here, because this file reaches the network:
// a pure list behind an axios import cannot be used by anything that is not allowed to load the auth
// store and the sync queue — which includes the unit tests for the flow's own logic.
export {
  EXPORT_CATEGORIES,
  EXPORT_FORMATS,
  type ExportCategory,
  type ExportFormat,
} from '../lib/dataExport';
import type { ExportCategory, ExportFormat } from '../lib/dataExport';

export type ExportStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'EXPIRED';

export interface DataExportRequest {
  exportId: string;
  status: ExportStatus;
  categories: ExportCategory[];
  format: ExportFormat;
  requestedAt: string;
  expiresAt: string | null;
  /** The server's own answer to "can this be downloaded right now" — never re-derived on the client. */
  downloadable: boolean;
  /** A sentence for the reader when status is FAILED. Never a stack trace (ADR-078). */
  failureReason: string | null;
}

/** Where the step-up code was sent. The full address is never returned — only a masked hint. */
export interface StepUpChallenge {
  channel: 'SMS' | 'EMAIL';
  destinationHint: string;
  expiresInSeconds: number;
}

/**
 * Send a step-up code for the export.
 *
 * The channel is the server's choice, not the caller's: SMS when the account has a phone number,
 * email otherwise. The screen renders whichever came back rather than assuming SMS — the mockup's
 * "sent to your registered device ending in ••••4567" is only true for Path A accounts.
 */
export async function requestExportStepUp(): Promise<StepUpChallenge> {
  return post<StepUpChallenge>('/auth/step-up/request', { action: 'data-export' });
}

/**
 * Exchange the code for a single-use action token.
 *
 * The token is bound to this user AND to `data-export`, lives five minutes, and is spent on first
 * use. It is not a session and cannot be exchanged for one.
 */
export async function verifyExportStepUp(code: string): Promise<string> {
  const res = await post<{ actionToken: string }>('/auth/step-up/verify', {
    action: 'data-export',
    code,
  });
  return res.actionToken;
}

export interface RequestExportBody {
  categories: ExportCategory[];
  format: ExportFormat;
  actionToken: string;
  /** Optional window. Absent means the complete record, which is what §30 entitles the subject to. */
  fromDate?: string;
  toDate?: string;
}

/**
 * Request the export. 202 — the archive is assembled by a Temporal workflow, so what comes back is
 * the request's state, not a file.
 */
export async function requestDataExport(body: RequestExportBody): Promise<DataExportRequest> {
  return post<DataExportRequest>('/users/me/data-export', {
    categories: body.categories,
    format: body.format,
    action_token: body.actionToken,
    ...(body.fromDate ? { from_date: body.fromDate } : {}),
    ...(body.toDate ? { to_date: body.toDate } : {}),
  });
}

/** The caller's own export requests, newest first. */
export async function listDataExports(): Promise<DataExportRequest[]> {
  return get<DataExportRequest[]>('/users/me/data-export');
}

/**
 * Mint a fresh signed download URL.
 *
 * Freshly signed on every call rather than a link emailed days ago: the archive holds every
 * coordinate the subject was ever recorded at, and ADR-078 rejected a week-long bearer URL sitting
 * in a mailbox.
 */
export async function exportDownloadUrl(
  exportId: string,
): Promise<{ url: string; expiresInSeconds: number }> {
  const { data } = await apiClient.get<{ url: string; expiresInSeconds: number }>(
    `/users/me/data-export/${encodeURIComponent(exportId)}/download`,
  );
  return data;
}
