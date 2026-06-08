-- pgvector schema: document_embeddings
-- Dimensions: 1536 (text-embedding-3-small)
-- Tenant isolation: row-level WHERE tenant_id + RLS policy
-- Source: docs/specifications/22-ai-architecture.md §22.3 Vector Store Tenant Isolation

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_embeddings (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID         NOT NULL,
  source_type   VARCHAR(50)  NOT NULL,    -- 'document' | 'site_report' | 'boq' | 'rfq'
  source_id     UUID         NOT NULL,
  content_hash  VARCHAR(64)  NOT NULL,    -- SHA-256 of chunked text (dedup guard per tenant)
  chunk_index   INTEGER      NOT NULL,    -- 0-based position within source
  embedding     VECTOR(1536) NOT NULL,    -- text-embedding-3-small output
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- HNSW index for approximate nearest neighbour search
CREATE INDEX IF NOT EXISTS document_embeddings_hnsw_idx
  ON document_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Tenant + recency filter index (pre-filter before HNSW scan)
CREATE INDEX IF NOT EXISTS document_embeddings_tenant_idx
  ON document_embeddings (tenant_id, source_type, created_at DESC);

-- RLS: tenant isolation (primary enforcement mechanism)
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_embeddings FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON document_embeddings
  AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
