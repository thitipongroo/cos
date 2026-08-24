-- Contract status lifecycle (ADR-058 CT-7): draft → signed → active → terminated. New contracts start
-- DRAFT (was ACTIVE); the draft→signed transition fires when both a VERIFIED INTERNAL and a VERIFIED
-- CLIENT signature exist. Existing rows keep their current status. status stays a free VARCHAR (no code
-- branches on it beyond this lifecycle; values: DRAFT / SIGNED / ACTIVE / TERMINATED).

ALTER TABLE finance.contracts ALTER COLUMN status SET DEFAULT 'DRAFT';
