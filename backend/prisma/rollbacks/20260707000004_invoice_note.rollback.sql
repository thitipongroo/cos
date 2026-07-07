-- Rollback for 20260707000004_invoice_note (QM-9).
ALTER TABLE procurement.invoices DROP COLUMN IF EXISTS note;
