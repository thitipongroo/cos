// Shared test double for ScheduledJobLockService.
//
// Every @Cron entry point now routes through runExclusively(), so all four scheduled-job suites need
// the same two behaviours: a lock that grants (so the existing assertions about what the job DOES
// still exercise the job) and one that denies (so each suite can assert the job does NOTHING on a
// replica that lost the lease). One double, because a per-suite copy that quietly forgot to invoke
// `fn` would make a whole suite pass while testing nothing.

import type { ScheduledJobLockService } from '../scheduled-job-lock.service';

export interface LockDouble {
  service: ScheduledJobLockService;
  /** Arguments runExclusively() was called with — job name and lease seconds are part of the contract. */
  calls: Array<{ jobName: string; leaseSeconds: number }>;
}

/** `granted: false` models a replica that lost the lease: `fn` must never run, and the caller gets null. */
export function makeLockDouble(granted = true): LockDouble {
  const calls: LockDouble['calls'] = [];
  const service = {
    runExclusively: jest.fn(
      async (jobName: string, leaseSeconds: number, fn: () => Promise<unknown>) => {
        calls.push({ jobName, leaseSeconds });
        return granted ? await fn() : null;
      },
    ),
  } as unknown as ScheduledJobLockService;
  return { service, calls };
}
