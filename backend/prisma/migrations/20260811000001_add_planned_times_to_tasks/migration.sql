-- Record the TIME OF DAY a task is planned for, alongside the dates it already carries.
--
-- Source: mockup/mobile/05_site_worker/01_home/01_sw_dashboard — each card under "TODAY'S PRIORITY
-- TASKS" is headed by a working window ("08:00 - 12:00", "13:00 - 15:00"), not by a date range.
-- It had nowhere to land: projects.tasks carries planned_start, planned_end and actual_start, and
-- all three are DATE. The screen was shipped printing the date range instead, which is a different
-- fact — a worker looking at a card at 09:00 wants to know whether this is the morning job, and
-- "Jul 6 → Jul 26" cannot tell them (product-owner decision 2026-08-11, asked for directly after
-- being raised as an escalation on 2026-08-10: add the backend rather than drop the field).
--
-- WHY TIME AND NOT TIMESTAMPTZ: the pairing is a WINDOW WITHIN THE PLANNED DAY, and the day is
-- already recorded next to it. Widening the existing DATE columns to timestamptz would have made
-- every existing consumer's comparison timezone-dependent overnight — lib/delaySeverity.ts floors
-- both sides to a calendar day precisely because planned_end is a DATE, and §17.5's day-boundary
-- rules read it the same way. A site's working hours are wall-clock hours at that site ("we pour at
-- eight"), which is what TIME WITHOUT TIME ZONE means; attaching an offset would store a fact about
-- the server that nobody on site asked for.
--
-- Backward-compatible (QM-9): both columns are additive and NULLABLE with no default, so deployed
-- code that never writes them keeps working. There is NO BACKFILL and none is possible — nothing
-- anywhere records what time a past task was planned for, and defaulting to an 08:00–17:00 working
-- day would invent a fact about work already done. Every consumer must treat NULL as "no time
-- recorded" and fall back to the dates, never to an assumed shift.
--
-- Rollback: prisma/rollbacks/20260811000001_add_planned_times_to_tasks.rollback.sql

ALTER TABLE projects.tasks
  ADD COLUMN IF NOT EXISTS planned_start_time TIME WITHOUT TIME ZONE;

ALTER TABLE projects.tasks
  ADD COLUMN IF NOT EXISTS planned_end_time TIME WITHOUT TIME ZONE;
