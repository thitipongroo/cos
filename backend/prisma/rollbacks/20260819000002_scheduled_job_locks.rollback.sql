-- Rollback: 20260819000002_scheduled_job_locks
--
-- Drops the leader-election lease table. Nothing of value is stored in it — the rows are ephemeral
-- coordination state, rebuilt on the next tick of each job — so there is no data to export first.
--
-- What comes back is the behaviour the table was added to stop: with the table gone,
-- ScheduledJobLockService cannot acquire and every scheduled job runs on every replica again. At
-- `minReplicas: 3` that means triple escalation notifications and triple digests. Do not run this
-- while more than one replica is scheduled; scale the deployment to a single replica first if the
-- table genuinely has to go.

DROP TABLE IF EXISTS platform.scheduled_job_locks;
