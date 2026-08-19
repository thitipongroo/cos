// ScheduledJobLockService — one replica runs a scheduled job, not all of them.
//
// @nestjs/schedule registers @Cron timers per PROCESS, so on a deployment with N replicas every job
// fires N times on the same minute. Production runs three (values-prod.yaml: replicaCount 3,
// autoscaling.minReplicas 3). For an idempotent sweep that is waste; for the notification jobs it is
// wrong output — three escalation messages for one unacknowledged incident, three copies of the daily
// digest — because the "have I already done this?" flag is written only AFTER the send.
//
// The lease lives in platform.scheduled_job_locks (migration 20260819000002); see that migration for
// why a lease row rather than a PostgreSQL advisory lock (PgBouncer transaction pooling).

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { hostname } from 'os';
import { createLogger } from '@cos/logger';
import { createPrismaClient } from '../prisma/create-prisma-client';

const logger = createLogger('scheduled-job-lock');

@Injectable()
export class ScheduledJobLockService implements OnModuleDestroy {
  // The privileged DATABASE_URL connection, like every other platform/cross-tenant service
  // (20260623000001_app_user_login_and_grants). There is no tenant context to set: a scheduled job
  // has no request behind it, so TenantPrismaService could not serve this even in principle.
  private readonly prisma = createPrismaClient();

  /** Identifies THIS replica. Under Kubernetes `hostname()` is the pod name, so a stuck lease names
   *  the pod to look at; the pid distinguishes restarts within one pod. */
  private readonly holder = `${hostname()}:${process.pid}`;

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /**
   * Run `fn` only if this replica wins the lease for `jobName`; otherwise do nothing and return null.
   *
   * `leaseSeconds` must exceed the job's worst-case runtime — while it is held, no other replica may
   * start the job, and once it passes another replica may take over even if this one is still
   * running. A run that completes releases the lease immediately (success or failure), so the lease
   * only actually has to survive a crash: the ceiling on how long a job stays blocked by a replica
   * that was SIGKILLed mid-run. Choose it well under the schedule interval for that reason.
   */
  async runExclusively<T>(
    jobName: string,
    leaseSeconds: number,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    if (!(await this.acquire(jobName, leaseSeconds))) {
      // Debug, not warn: on a three-replica deployment two of these per tick is the SYSTEM WORKING.
      logger.debug(
        { jobName, holder: this.holder },
        'scheduled-job.skipped — lease held elsewhere',
      );
      return null;
    }

    try {
      return await fn();
    } finally {
      // Always release, including after a throw. Holding a lease for the rest of its term because the
      // run failed would make one bad tick delay every following one — the retry is the next tick,
      // and it should be free to happen on any replica.
      await this.release(jobName);
    }
  }

  /**
   * Take the lease if it is free or expired. ONE statement, deliberately: a SELECT followed by an
   * UPDATE is exactly the read-then-write race this service exists to remove — three replicas would
   * all read "expired" and all proceed. INSERT … ON CONFLICT DO UPDATE resolves that under a row
   * lock, and the WHERE on the DO UPDATE is what makes a live lease return no row at all.
   */
  private async acquire(jobName: string, leaseSeconds: number): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ job_name: string }>>`
        INSERT INTO platform.scheduled_job_locks (job_name, holder, acquired_at, locked_until)
        VALUES (
          ${jobName},
          ${this.holder},
          now(),
          now() + (${leaseSeconds}::int * interval '1 second')
        )
        ON CONFLICT (job_name) DO UPDATE
           SET holder       = EXCLUDED.holder,
               acquired_at  = now(),
               locked_until = EXCLUDED.locked_until
         WHERE platform.scheduled_job_locks.locked_until < now()
        RETURNING job_name
      `;
      return rows.length > 0;
    } catch (err) {
      // Fail CLOSED. If the lock table cannot be reached we cannot tell whether another replica is
      // already running the job, and the failure mode this service exists to prevent is duplicate
      // work — so the safe answer to "am I the leader?" when the answer is unknown is no. A job
      // missed for one tick is recoverable; three copies of a notification already sent is not.
      logger.error({ jobName, err }, 'scheduled-job.lock-unavailable — skipping this tick');
      return false;
    }
  }

  /** Release the lease — but only if it is still ours. The `holder` predicate matters: if the lease
   *  already expired and another replica took over mid-run, this must not cut that run short. */
  private async release(jobName: string): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        UPDATE platform.scheduled_job_locks
           SET locked_until = now()
         WHERE job_name = ${jobName} AND holder = ${this.holder}
      `;
    } catch (err) {
      // Non-fatal by design: the lease expires on its own, so a failed release costs at most one
      // skipped tick. Throwing here would replace the job's real error with this one.
      logger.warn({ jobName, err }, 'scheduled-job.release-failed — lease will expire on its own');
    }
  }
}
