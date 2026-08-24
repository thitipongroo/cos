-- Rollback: materialized BOQ line snapshot (ADR-058 CT-2c-2).
DROP TABLE IF EXISTS finance.boq_line_snapshots CASCADE;
