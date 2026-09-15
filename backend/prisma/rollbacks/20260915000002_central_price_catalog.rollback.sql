-- Rollback: 20260915000002_central_price_catalog
--
-- Drops the ราคากลาง catalog, its sync-run record, and the three ADR-061 reference columns on
-- boq.boq_items.
--
-- ROLL THE BACKEND BACK FIRST. The central-prices module reads and writes both tables, and the BOQ module
-- written with this migration names the new boq_items columns explicitly — BoqRepository.addItem /
-- updateItem write them and copyVersionContents copies them. Against a rolled-back schema every BOQ item
-- create, update and version copy fails with "column does not exist". A backend from before 2026-09-15
-- is unaffected: it reads boq_items with SELECT * and never named these columns.
--
-- DATA IS DESTROYED, AND ONLY SOME OF IT CAN BE REBUILT.
--
--   * The catalog itself can be re-imported from the source files, if they were kept. Nothing in this
--     repository keeps them.
--   * The sync-run history cannot be rebuilt. The audit rows in platform.audit_logs survive
--     (`central_prices.import` / `central_prices.sync`, metadata carries the counts), so the fact that
--     each import happened is not lost — only the per-run panel data.
--   * reference_price and price_variance are SNAPSHOTS taken when a line was linked. Re-running the
--     migration gives back empty columns; a re-import cannot restore the value a line was estimated
--     against if the catalog has changed since. Export first if they matter:
--
--       \copy (SELECT item_id, central_price_id, reference_price, price_variance
--                FROM boq.boq_items WHERE central_price_id IS NOT NULL)
--             TO 'boq_item_central_prices.csv' CSV HEADER
--
-- ORDER. boq_items.central_price_id references the catalog, so the columns go before the table. One
-- transaction, so a failure part-way leaves the schema exactly as it was rather than with the columns
-- gone and the catalog still there. Re-runnable: every step is guarded.

BEGIN;

DROP INDEX IF EXISTS boq.idx_boq_items_central_price;

ALTER TABLE boq.boq_items
  DROP COLUMN IF EXISTS price_variance,
  DROP COLUMN IF EXISTS reference_price,
  DROP COLUMN IF EXISTS central_price_id;

-- DROP TABLE takes the indexes, CHECKs, the actor foreign key and the grants with it.
DROP TABLE IF EXISTS platform.central_price_sync_runs;
DROP TABLE IF EXISTS platform.central_price_catalog;

COMMIT;
