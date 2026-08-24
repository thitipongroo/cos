-- Rollback: Phase 11 document_embeddings migration (QM-9)
-- Safe to run only when no deployed code references this table.
-- The `vector` extension is left installed — other tables may use it, and dropping an extension in
-- use fails; it is harmless to leave.

DROP TABLE IF EXISTS ai.document_embeddings CASCADE;
