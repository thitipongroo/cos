// PDPA data-export workflow (ADR-078) — TestWorkflowEnvironment, real Temporal execution.
//
// The activities are covered by data-export.activities.spec.ts. What only a workflow run can prove is
// the ORDER and the failure path, and both are compliance-relevant:
//   - a §30 request must never sit at PROCESSING because the job died; the row has to reach FAILED
//   - the "ready" mail must not go out before the row says READY, or it sends the subject to a page
//     that tells them their finished export is still being prepared
//   - the failure text the subject receives must not be the exception string

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import {
  dataExportWorkflow,
  type DataExportWorkflowParams,
} from '../workflows/data-export.workflow';

const markProcessing = jest.fn().mockResolvedValue(undefined);
const collectAndUpload = jest.fn().mockResolvedValue('file-9');
const markReady = jest.fn().mockResolvedValue(undefined);
const markFailed = jest.fn().mockResolvedValue(undefined);
const notifySubject = jest.fn().mockResolvedValue(undefined);

/** Every activity appends to this, so a test can assert the sequence rather than each call alone. */
let order: string[] = [];

const activities = {
  markProcessingActivity: (...a: unknown[]) => {
    order.push('processing');
    return markProcessing(...a) as Promise<void>;
  },
  collectAndUploadActivity: (...a: unknown[]) => {
    order.push('collect');
    return collectAndUpload(...a) as Promise<string>;
  },
  markReadyActivity: (...a: unknown[]) => {
    order.push('ready');
    return markReady(...a) as Promise<void>;
  },
  markFailedActivity: (...a: unknown[]) => {
    order.push('failed');
    return markFailed(...a) as Promise<void>;
  },
  notifySubjectActivity: (...a: unknown[]) => {
    order.push('notify');
    return notifySubject(...a) as Promise<void>;
  },
};

const PARAMS: DataExportWorkflowParams = {
  export_id: '33333333-3333-4333-8333-333333333333',
  tenant_id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
};

describe('dataExportWorkflow', () => {
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await testEnv.teardown();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    collectAndUpload.mockResolvedValue('file-9');
    order = [];
    // Fresh worker per test — runUntil() shuts the worker down on completion.
    worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: 'test-data-export',
      workflowsPath: require.resolve('../workflows/data-export.workflow'),
      activities,
    });
  });

  it('PROCESSING → collect → READY → notify, in that order', async () => {
    await worker.runUntil(async () => {
      await testEnv.client.workflow.execute(dataExportWorkflow, {
        taskQueue: 'test-data-export',
        workflowId: 'export-happy',
        args: [PARAMS],
      });
    });

    // The mail goes out AFTER the row says READY. Reversed, it points the subject at a page that
    // reports their finished export as still being prepared.
    expect(order).toEqual(['processing', 'collect', 'ready', 'notify']);
    expect(markReady).toHaveBeenCalledWith(expect.objectContaining({ file_id: 'file-9' }));
    expect(notifySubject).toHaveBeenCalledWith(expect.objectContaining({ ready: true }));
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('records FAILED and notifies when the export cannot be produced', async () => {
    collectAndUpload.mockRejectedValue(new Error('relation "site_ops.issues" does not exist'));

    await worker.runUntil(async () => {
      await expect(
        testEnv.client.workflow.execute(dataExportWorkflow, {
          taskQueue: 'test-data-export',
          workflowId: 'export-failed',
          args: [PARAMS],
        }),
      ).rejects.toThrow();
    });

    // Three collect attempts before giving up (the retry policy), then FAILED, then the mail.
    // Recorded before it re-throws: without this the subject sees PROCESSING past the 30-day clock
    // and re-submits, and nobody can tell a dead job from a slow one.
    expect(order).toEqual(['processing', 'collect', 'collect', 'collect', 'failed', 'notify']);
    expect(notifySubject).toHaveBeenCalledWith(expect.objectContaining({ ready: false }));
    expect(markReady).not.toHaveBeenCalled();
    // Recorded exactly once, not once per failed attempt — the retries are inside the activity proxy.
    expect(markFailed).toHaveBeenCalledTimes(1);
  });

  it('never puts the exception text in what the subject is told', async () => {
    // An activity error carries schema and table names and sometimes part of the query. This string
    // is emailed, and readable by anyone the subject forwards it to (QM-10).
    collectAndUpload.mockRejectedValue(
      new Error('relation "site_ops.issues" does not exist at character 42'),
    );

    await worker.runUntil(async () => {
      await expect(
        testEnv.client.workflow.execute(dataExportWorkflow, {
          taskQueue: 'test-data-export',
          workflowId: 'export-safe-message',
          args: [PARAMS],
        }),
      ).rejects.toThrow();
    });

    const [{ reason }] = markFailed.mock.calls[0] as [{ reason: string }];
    expect(reason).not.toContain('site_ops');
    expect(reason).not.toContain('relation');
    expect(reason).toContain('request a new export');
  });

  it('retries the collect step before giving up', async () => {
    // 15-minute timeout, 3 attempts: gathering one person's records across every schema is minutes of
    // work, and a transient failure halfway should not cost the subject a re-request.
    collectAndUpload
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce('file-9');

    await worker.runUntil(async () => {
      await testEnv.client.workflow.execute(dataExportWorkflow, {
        taskQueue: 'test-data-export',
        workflowId: 'export-retry',
        args: [PARAMS],
      });
    });

    expect(collectAndUpload).toHaveBeenCalledTimes(2);
    expect(markReady).toHaveBeenCalledWith(expect.objectContaining({ file_id: 'file-9' }));
    expect(markFailed).not.toHaveBeenCalled();
  });
});
