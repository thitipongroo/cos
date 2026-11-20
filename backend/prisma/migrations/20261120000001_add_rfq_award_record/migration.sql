-- One award per RFQ, recorded where it is made (plan CR, product owner 2026-11-20).
--
-- WHY. awardRfq checked the RFQ was EVALUATED, marked the quotation selected and signalled the workflow; the
-- workflow moves the RFQ to AWARDED a moment later. Nothing recorded the award itself, so a second award in that
-- window moved the selection to another quotation — the last one won, silently. These columns are that record:
-- awardRfq sets them with a guarded UPDATE (EVALUATED, and not yet awarded or awarded to the same quotation), so a
-- second award of a different quotation finds no row and is refused (409); the same quotation again re-signals.
--
-- BACKWARD-COMPATIBLE (QM-9). Additive only: two nullable columns, NULL on every existing RFQ. A backend that does
-- not know them is unaffected. Existing AWARDED RFQs are not backfilled — their award was the selected quotation,
-- which is still on procurement.quotations.is_selected.

ALTER TABLE procurement.rfqs
  ADD COLUMN awarded_quotation_id UUID
    CONSTRAINT rfqs_awarded_quotation_fk REFERENCES procurement.quotations (quotation_id),
  ADD COLUMN awarded_at TIMESTAMPTZ,
  ADD CONSTRAINT rfqs_award_record_complete
    CHECK ((awarded_quotation_id IS NULL) = (awarded_at IS NULL));
