-- Phase 11 — RAG vector store (spec §22.3 "Vector Store Tenant Isolation")
--
-- Backs PgVectorBackend in services/ai-gateway/rag/backends.py. Two deliberate extensions beyond the
-- literal DDL in §22.3, both forced by the retrieval code that must run against this table:
--
--   1. chunk_text — §22.3 lists content_hash (dedup) but no text column. Retrieval returns the chunk
--      text as LLM context (backends.py selects `chunk_text AS text`); without it RAG has nothing to
--      feed the model. Storing the text is not optional for the feature to work.
--   2. RLS (FORCE) — §22.3's tier table describes SMB isolation as an application-layer
--      `WHERE tenant_id = $x`, but PgVectorBackend.search issues `WHERE TRUE` and relies entirely on
--      `set_config('app.current_tenant_id', $1, true)` + a row-security policy to scope rows. RLS is
--      also the house pattern (files.photo_annotations, site_ops.carbon_records) and the stronger
--      guarantee §22.3 Enforcement Rule 2 demands ("a single mis-scoped query is a security incident").

CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS ai;

CREATE TABLE IF NOT EXISTS ai.document_embeddings (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID         NOT NULL,           -- isolation key (§22.3)
  source_type   VARCHAR(50)  NOT NULL,           -- 'document' | 'site_report' | 'boq' | 'rfq'
  source_id     UUID         NOT NULL,           -- the source entity
  chunk_text    TEXT         NOT NULL,           -- the chunk itself — returned to the LLM as context
  content_hash  VARCHAR(64)  NOT NULL,           -- SHA-256 of chunk_text (per-tenant dedup guard)
  chunk_index   INTEGER      NOT NULL,           -- 0-based position within source
  embedding     VECTOR(1536) NOT NULL,           -- text-embedding-3-small output
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- HNSW approximate nearest-neighbour search across all tenants in the shared tier (§22.3, m/ef per spec).
CREATE INDEX IF NOT EXISTS idx_document_embeddings_hnsw
  ON ai.document_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Tenant + recency filter, narrows the candidate set before the HNSW scan (§22.3).
CREATE INDEX IF NOT EXISTS idx_document_embeddings_tenant_recency
  ON ai.document_embeddings (tenant_id, source_type, created_at DESC);

-- Per-tenant content dedup (§22.3 Enforcement Rule 4): two tenants storing identical text is not a
-- leak, so the uniqueness is scoped by tenant + source, not global.
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_embeddings_dedup
  ON ai.document_embeddings (tenant_id, source_id, chunk_index);

-- ── RLS (§22.3 Enforcement Rules 1–2; QM-9) ──────────────────────────────────────────────────────
ALTER TABLE ai.document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.document_embeddings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant_isolation ON ai.document_embeddings;

CREATE POLICY rls_tenant_isolation ON ai.document_embeddings
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);
