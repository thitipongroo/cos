-- Contract free-text terms (ADR-058 CT-2c-1). Input for in-app contract-document generation
-- (Contract + BOQ + terms → PDF). Nullable free text, set at contract create time; grants + RLS are
-- inherited from finance.contracts (unchanged).

ALTER TABLE finance.contracts ADD COLUMN terms TEXT;
