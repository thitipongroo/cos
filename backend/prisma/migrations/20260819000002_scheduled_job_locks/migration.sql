-- platform.scheduled_job_locks — one leader per scheduled job, across replicas (ADR-095).
--
-- WHAT WAS WRONG
-- --------------
-- Four @Cron jobs (notification-escalation, notification-digest, exchange-rate-refresh,
-- sync-tombstone-prune) ran on EVERY replica. @nestjs/schedule registers its timers per process, and
-- production runs `replicaCount: 3` with `autoscaling.minReplicas: 3`
-- (infrastructure/helm/cos-backend/values-prod.yaml), so each job fired three times on the same
-- minute. For the two notification jobs the effect is user-visible and not idempotent: three
-- replicas SELECT the same `escalated_at IS NULL` rows, all three send, and only then does anyone
-- UPDATE — so every unacknowledged safety incident escalated three times, and every project manager
-- received the daily digest three times.
--
-- WHY A LEASE TABLE AND NOT AN ADVISORY LOCK
-- ------------------------------------------
-- `pg_advisory_lock` is SESSION-scoped, and the application talks to PostgreSQL through PgBouncer in
-- TRANSACTION pooling mode (QM-18): the connection holding the lock is returned to the pool at
-- commit, so the lock's lifetime stops matching the job's. `pg_advisory_xact_lock` fixes that only by
-- keeping a transaction open for the whole job, which for the hourly digest means a transaction open
-- for minutes. A lease row has neither problem: it is ordinary data, it survives connection churn,
-- and a holder that is SIGKILLed mid-run stops blocking the job when `locked_until` passes instead of
-- blocking it forever.
--
-- Acquisition is a single INSERT … ON CONFLICT DO UPDATE … WHERE locked_until < now() RETURNING, so
-- the take-over decision is made by one atomic statement under a row lock. No read-then-write, which
-- is the race this table exists to remove rather than reproduce.

CREATE TABLE platform.scheduled_job_locks (
  -- The @Cron `name` — 'notification-escalation', 'notification-digest', etc. One row per job, and
  -- the primary key is what makes ON CONFLICT the arbiter between simultaneous replicas.
  job_name     VARCHAR(100) PRIMARY KEY,
  -- Who holds it: "<pod hostname>:<pid>". Diagnostic, and it is also what makes release safe — a
  -- replica may only release a lease it still owns, never one that has already been taken over.
  holder       VARCHAR(150) NOT NULL,
  acquired_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- The lease. A run that finishes sets this to now() (releasing immediately); a run that dies leaves
  -- it to expire, which is the only reason the column is a timestamp rather than a boolean.
  locked_until TIMESTAMPTZ  NOT NULL
);

-- platform.* is cross-tenant and RLS-exempt (§11.0, same as platform.users). The rows describe the
-- deployment, not any tenant's data — there is nothing here to scope.

-- The table is written by the privileged DATABASE_URL connection that the platform/cross-tenant
-- services already use (see 20260623000001_app_user_login_and_grants). app_user is granted anyway so
-- the schema stays uniform and a future caller on the app role is not blocked by a missing privilege.
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.scheduled_job_locks TO app_user;
