// A report saved over an existing one keeps THAT report's id on the server (same project, day and
// submitter — the natural-key path of syncSiteReports). /sync/push answers with the kept id in
// `server_payload.report_id` (fix/site-report-id-remap); before that the device went on holding the
// report under its own client id: delta sync then brought the server's row as a second local row, and
// the photos taken on the screen uploaded with an `entity_id` that named no server report.
//
// The decision lives here, where the unit gate reaches it; the SQL is in db/database.ts.

export interface SiteReportRemapStore {
  /** Whether a local report row already holds `reportId` (delta sync may have brought it). */
  hasReport(reportId: string): Promise<boolean>;
  /** Move the local rows held under `fromId` to `toId`. */
  moveReports(fromId: string, toId: string): Promise<void>;
  /** Drop the local rows held under `reportId` (the server's own row is already local). */
  dropReports(reportId: string): Promise<void>;
  /** Move this report's photos that are not uploaded yet from `fromId` to `toId`. */
  moveUnuploadedPhotos(fromId: string, toId: string): Promise<void>;
}

/** The kept report id in a push answer, or null when it names none. */
export function keptReportId(serverPayload: unknown): string | null {
  const id = (serverPayload as { report_id?: unknown } | null)?.report_id;
  return typeof id === 'string' && id !== '' ? id : null;
}

/**
 * Move the device's copy of a pushed report to the id the server kept. Returns the id the device now
 * holds it under. Photos already uploaded are not touched: their file records already name `localId`.
 */
export async function remapSiteReport(
  store: SiteReportRemapStore,
  localId: string,
  serverPayload: unknown,
): Promise<string> {
  const keptId = keptReportId(serverPayload);
  if (keptId === null || keptId === localId) return localId;
  if (await store.hasReport(keptId)) await store.dropReports(localId);
  else await store.moveReports(localId, keptId);
  await store.moveUnuploadedPhotos(localId, keptId);
  return keptId;
}
