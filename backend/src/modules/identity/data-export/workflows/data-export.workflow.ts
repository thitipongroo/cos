// PDPA §30/§31 data-export workflow (ADR-078).
//
// Linear, no signals, no timers: a subject-rights request is not a state machine a human steers.
// PENDING → PROCESSING → READY, or → FAILED. Everything here is deterministic; all I/O is activities.
//
// WHY A WORKFLOW AND NOT A QUEUE JOB. PDPA §30 gives the controller 30 days, and the export reads
// across every domain schema — it is slow, it can fail halfway, and a lost job is a missed statutory
// deadline with no trace. Temporal gives the retry, the durability, and a history an auditor can read.

import { proxyActivities, log } from '@temporalio/workflow';
import type {
  collectAndUploadActivity,
  markFailedActivity,
  markProcessingActivity,
  markReadyActivity,
  notifySubjectActivity,
} from './data-export.activities';

export interface DataExportWorkflowParams {
  export_id: string;
  tenant_id: string;
  user_id: string;
}

/**
 * The gather-and-upload step gets a long timeout and few attempts; the status writes get the
 * opposite. Collecting one person's records across every schema is minutes of work that is expensive
 * to repeat, while an UPDATE that failed on a blip should just be retried.
 */
const collectActs = proxyActivities<{
  collectAndUploadActivity: typeof collectAndUploadActivity;
}>({
  startToCloseTimeout: '15m',
  retry: { maximumAttempts: 3, initialInterval: '30s', backoffCoefficient: 2 },
});

const statusActs = proxyActivities<{
  markProcessingActivity: typeof markProcessingActivity;
  markReadyActivity: typeof markReadyActivity;
  markFailedActivity: typeof markFailedActivity;
  notifySubjectActivity: typeof notifySubjectActivity;
}>({
  startToCloseTimeout: '2m',
  retry: { maximumAttempts: 5, initialInterval: '5s', backoffCoefficient: 2 },
});

/**
 * The message the subject sees when the job fails.
 *
 * Deliberately not the exception text: an activity error carries schema names, table names and
 * sometimes a fragment of the query, and this string is emailed to the subject and readable by anyone
 * they forward it to. The detail lives in the worker's logs and the Temporal history, where the
 * people who can act on it can see it (QM-10).
 */
const SUBJECT_SAFE_FAILURE =
  'The export could not be produced. This has been recorded and the team has been notified — ' +
  'you can request a new export at any time.';

export async function dataExportWorkflow(params: DataExportWorkflowParams): Promise<void> {
  await statusActs.markProcessingActivity(params);

  let fileId: string;
  try {
    fileId = await collectActs.collectAndUploadActivity(params);
  } catch (err) {
    // Recorded, then re-thrown. Recording is what stops the subject seeing PROCESSING forever and
    // re-submitting; re-throwing is what makes the workflow show as failed in Temporal rather than
    // as a success that quietly produced nothing.
    log.error('data_export.failed', { export_id: params.export_id, err: String(err) });
    await statusActs.markFailedActivity({ ...params, reason: SUBJECT_SAFE_FAILURE });
    await statusActs.notifySubjectActivity({ ...params, ready: false });
    throw err;
  }

  await statusActs.markReadyActivity({ ...params, file_id: fileId });
  // Notified last, and only after the row says READY — a mail that arrives before the status flips
  // sends the subject to a page that tells them their finished export is still being prepared.
  await statusActs.notifySubjectActivity({ ...params, ready: true });
  log.info('data_export.ready', { export_id: params.export_id });
}
