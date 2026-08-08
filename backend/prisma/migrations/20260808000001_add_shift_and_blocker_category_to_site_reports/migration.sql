-- Record the SHIFT a daily site report covers, and CLASSIFY its blocker.
--
-- Source: mockup/mobile/05_site_worker/03_reports/00_main — the Site Worker's daily-entry screen
-- draws a "กะการทำงาน" (Day/Night) selector next to the manpower count and a "เลือกประเภทอุปสรรค"
-- category select above the free-text blocker description. Neither had anywhere to land:
-- site_ops.site_reports carried `manpower_count` and a free-text `blockers` column and nothing else,
-- so both controls would have been drawn and then discarded on submit (product-owner decision
-- 2026-08-08 — add the backend rather than drop the fields).
--
-- WHY A CATEGORY AND NOT JUST THE TEXT: `blockers` stays exactly as it is — the operator's own words
-- are the record. The category is the queryable dimension on top of it, which is what makes
-- "how many days did weather stop us" answerable without reading every report. Dropping free text in
-- favour of an enum would have lost detail; this adds the axis without touching what is already there.
--
-- Values are CHECK-constrained rather than a PostgreSQL ENUM type, matching the convention every
-- other status column in this schema already follows (site_reports.status, issues.issue_type,
-- inspections.status): adding a value later is an ALTER of the constraint, and no type lives in a
-- schema the connection's search_path has to reach (spec §11.0 rule 2).
--
-- Backward-compatible (QM-9): both columns are additive and NULLABLE with no default, so deployed
-- code that never writes them keeps working, and every pre-existing report keeps NULL. There is no
-- backfill and none is possible — no other column, event or log records which shift a past report
-- covered, and inferring one from `client_submitted_at` would invent a fact (a report filed at 20:00
-- may be a day-shift report written late). Reports created before this migration stay unclassified,
-- and every consumer must treat NULL as "not recorded", never as a default of DAY.
--
-- Rollback: prisma/rollbacks/20260808000001_add_shift_and_blocker_category_to_site_reports.rollback.sql

ALTER TABLE site_ops.site_reports
  ADD COLUMN IF NOT EXISTS shift VARCHAR(10)
    CHECK (shift IN ('DAY', 'NIGHT'));

ALTER TABLE site_ops.site_reports
  ADD COLUMN IF NOT EXISTS blocker_category VARCHAR(20)
    CHECK (blocker_category IN ('WEATHER', 'MATERIAL', 'POWER', 'OTHER'));
