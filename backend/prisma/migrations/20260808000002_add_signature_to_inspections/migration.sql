-- Store the signature a worker draws when confirming a safety checklist.
--
-- Source: mockup/mobile/05_site_worker/04_safety "DIGITAL AUTHORIZATION" — a signature pad, a Clear
-- control and a timestamp, closing the daily verification. The screen shipped on 2026-08-08 WITHOUT
-- it, on the grounds that nothing stored a signature and drawing one that is discarded on submit is
-- worse than not offering it. The product owner's answer (2026-08-08) was to store it for real
-- rather than drop the zone, so this is that column.
--
-- WHY STROKES AND NOT AN IMAGE. The value is `AnnotationStroke[]` — the exact shape ADR-056 already
-- defines for photo markup: `[{ d: "<SVG path, NORMALISED 0..1>", color, width }]`. Normalised
-- coordinates mean the signature re-renders correctly at any pad size or screen density, which a
-- rasterised PNG cannot do, and the payload is a few hundred bytes rather than tens of kilobytes on
-- a queue that flushes over site 3G (§17.7 caps the sync batch). It also reuses the drawing code and
-- the type that already exist, instead of introducing a second representation of "ink".
--
-- WHAT IT IS AND IS NOT. This is an ATTESTATION MARK on an internal record, not a qualified
-- electronic signature: it carries no PKI, no certificate and no non-repudiation. The legally
-- meaningful facts are already on the row — `inspected_by` (the authenticated user) and
-- `inspected_at`. Contract e-signature is a different mechanism entirely (ADR-058, CredentialService,
-- bilateral PKI/VC) and must not be conflated with this.
--
-- CLASSIFICATION: a handwritten signature is personal data under PDPA §6 — it identifies a natural
-- person. It is tagged RESTRICTED and inherits site_ops.inspections' tenant RLS; a subject-rights
-- erasure clears this column with the rest of the row's PII.
--
-- Backward-compatible (QM-9): additive and NULLABLE, so deployed code that never writes it keeps
-- working and every existing inspection keeps NULL — which correctly means "not signed", since none
-- of them ever collected one. There is no backfill and none is possible.
--
-- Rollback: prisma/rollbacks/20260808000002_add_signature_to_inspections.rollback.sql

ALTER TABLE site_ops.inspections
  ADD COLUMN IF NOT EXISTS signature JSONB;

COMMENT ON COLUMN site_ops.inspections.signature IS
  'RESTRICTED @pdpa(category: "biometric_like") — AnnotationStroke[] (ADR-056 shape, normalised 0..1). Attestation mark only: no PKI, no non-repudiation. NULL = unsigned.';
