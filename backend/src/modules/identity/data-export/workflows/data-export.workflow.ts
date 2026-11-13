// PDPA §30/§31 data-export workflow (ADR-078).
//
// Linear, no signals, no timers: a subject-rights request is not a state machine a human steers.
// PENDING → PROCESSING → READY, or → FAILED. Everything here is deterministic; all I/O is activities.
//
// WHY A WORKFLOW AND NOT A QUEUE JOB. PDPA §30 gives the controller 30 days, and the export reads
// across every domain schema — it is slow, it can fail halfway, and a lost job is a missed statutory
// deadline with no trace. Temporal gives the retry, the durability, and a history an auditor can read.

import {
  ActivityFailure,
  ApplicationFailure,
  log,
  patched,
  proxyActivities,
  sleep,
} from '@temporalio/workflow';
import { TENANT_PAUSED_FAILURE } from '../../../../shared/workflows/provisioning-pause';
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

// D52 (2026-11-13): a tenant paused by enterprise provisioning (D48) refuses its data until it resumes.
// The collect and the notice wait that out instead of failing the export: retry every minute while the
// activity reports TENANT_PAUSED_FAILURE, for at most 24 h — the bound the provisioning copy itself has.
// A deactivated tenant is not waited for. Runs whose history predates this keep failing as before.
export const EXPORT_WAITS_OUT_PAUSE_PATCH = 'export-waits-out-pause';
const PAUSE_POLL = '1 minute';
const PAUSE_LIMIT_MS = 24 * 60 * 60 * 1000;

function isTenantPaused(err: unknown): boolean {
  return (
    err instanceof ActivityFailure &&
    err.cause instanceof ApplicationFailure &&
    err.cause.type === TENANT_PAUSED_FAILURE
  );
}

async function waitingOutPause<T>(step: string, fn: () => Promise<T>): Promise<T> {
  if (!patched(EXPORT_WAITS_OUT_PAUSE_PATCH)) return fn();
  const started = Date.now();
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isTenantPaused(err) || Date.now() - started >= PAUSE_LIMIT_MS) throw err;
      log.info('data_export.tenant_paused.waiting', { step });
      await sleep(PAUSE_POLL);
    }
  }
}

export async function dataExportWorkflow(params: DataExportWorkflowParams): Promise<void> {
  await statusActs.markProcessingActivity(params);

  let fileId: string;
  try {
    fileId = await waitingOutPause('collect', () => collectActs.collectAndUploadActivity(params));
  } catch (err) {
    // Recorded, then re-thrown. Recording is what stops the subject seeing PROCESSING forever and
    // re-submitting; re-throwing is what makes the workflow show as failed in Temporal rather than
    // as a success that quietly produced nothing.
    log.error('data_export.failed', { export_id: params.export_id, err: String(err) });
    await statusActs.markFailedActivity({ ...params, reason: SUBJECT_SAFE_FAILURE });
    await waitingOutPause('notify', () =>
      statusActs.notifySubjectActivity({ ...params, ready: false }),
    );
    throw err;
  }

  await statusActs.markReadyActivity({ ...params, file_id: fileId });
  // Notified last, and only after the row says READY — a mail that arrives before the status flips
  // sends the subject to a page that tells them their finished export is still being prepared.
  await waitingOutPause('notify', () =>
    statusActs.notifySubjectActivity({ ...params, ready: true }),
  );
  log.info('data_export.ready', { export_id: params.export_id });
}
