-- G-M14 — vendor invoice free-text note (§20.7.4 / nav 3112 "add note"). A single overwritable note
-- on the invoice record. Backward-compatible additive column (QM-9): nullable, no default, no backfill.
ALTER TABLE procurement.invoices ADD COLUMN IF NOT EXISTS note TEXT;
