-- Rollback for 20261120000001_add_rfq_award_record.
--
-- ROLL THE BACKEND BACK FIRST. awardRfq writes these columns; under a running backend that still does, dropping
-- them makes every award fail on `column "awarded_quotation_id" does not exist`.
--
-- Dropping the columns discards which quotation each RFQ was awarded to and when. The selection itself stays on
-- procurement.quotations.is_selected.

ALTER TABLE procurement.rfqs
  DROP CONSTRAINT IF EXISTS rfqs_award_record_complete,
  DROP CONSTRAINT IF EXISTS rfqs_awarded_quotation_fk,
  DROP COLUMN IF EXISTS awarded_at,
  DROP COLUMN IF EXISTS awarded_quotation_id;
