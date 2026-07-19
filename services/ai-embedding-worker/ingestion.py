"""RAG ingestion pipeline (§22.7 OCR pipeline → embedding; §22.3 vector store).

On a ``file.document.uploaded.v1`` event: fetch text (OCR for PDFs/images), chunk it, embed each
chunk, and write the vectors to ``ai.document_embeddings`` — the store the RAG retriever reads.

The pipeline is a plain function with injected dependencies (ocr, embedder, db_pool) so its logic —
chunking, per-tenant dedup, batch embedding, the insert — is unit-testable without a broker, OCR
service, OpenAI, or Postgres. A thin aiokafka consumer (consumer.py) wraps it in production.

MOCK-VERIFIED ONLY for the embed step: no OPENAI_API_KEY here, so real vectors have never been
produced. Everything else (chunk, dedup, insert shape) runs against real fakes / a real table.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from providers.embedding_provider import EmbeddingProvider
from utils.chunking import chunk_document


@dataclass
class UploadedDocument:
    tenant_id: str
    source_type: str  # 'document' | 'site_report' | 'boq' | 'rfq'
    source_id: str
    text: str


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


async def ingest_document(
    doc: UploadedDocument,
    *,
    embedder: EmbeddingProvider,
    db_pool,
) -> int:
    """Chunk → embed → write. Returns the number of chunks stored.

    Dedup is per (tenant_id, source_id, chunk_index) via ON CONFLICT DO NOTHING against the unique
    index — replaying the same document event does not duplicate rows or re-bill embeddings for
    chunks that already exist. (The embed call itself is still made; a future optimisation could
    skip embedding chunks whose content_hash is unchanged.)
    """
    chunks = chunk_document(doc.text, doc.source_type, doc.source_id)
    if not chunks:
        return 0

    vectors = await embedder.embed([c.content for c in chunks])
    if len(vectors) != len(chunks):
        raise ValueError(f"embedder returned {len(vectors)} vectors for {len(chunks)} chunks")

    rows = [
        (
            doc.tenant_id,
            doc.source_type,
            doc.source_id,
            chunk.content,
            _content_hash(chunk.content),
            chunk.chunk_index,
            _to_vector_literal(vector),
        )
        for chunk, vector in zip(chunks, vectors)
    ]

    await db_pool.executemany(
        """
        INSERT INTO ai.document_embeddings
          (tenant_id, source_type, source_id, chunk_text, content_hash, chunk_index, embedding)
        VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7::vector)
        ON CONFLICT (tenant_id, source_id, chunk_index) DO NOTHING
        """,
        rows,
    )
    return len(rows)


def _to_vector_literal(vector: list[float]) -> str:
    """pgvector text input form: ``[0.1,0.2,...]``. Matches the reader in ai-gateway rag/backends."""
    return "[" + ",".join(str(x) for x in vector) + "]"
