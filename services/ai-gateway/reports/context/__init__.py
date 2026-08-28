"""Deterministic context assembly for the three non-delay reports.

WHY THIS IS SQL AND NOT THE RAG API. master:4020 words step 1 of the pipeline as "RAG retrieval (via
Phase 11 RAG API)", and until 2026-08-29 the three reports here simply passed no context at all —
which nothing noticed, because the only test of the step sequence omitted step 1.

Wiring them to `/api/v1/rag/query` would not have fixed it. That index holds ONE thing: chunks of
uploaded files (`ai-embedding-worker/consumer.py` subscribes to `{tenant}.file.document.uploaded.v1`
and nothing else). Site reports, POs, RFQs and invoices are not in it. Even if they were, the
questions these reports ask — how many issues are open, how many POs are past their delivery date,
how far actual spend has diverged from budget — are aggregates, and vector similarity cannot answer
an aggregate: it returns the k passages that read most like the question, not a count.

So the pattern here is the one delay-risk already uses (risk/context.py) and the one the industry
settled on: route by the SHAPE of the question. Relational for figures, vector for prose. The
retrieval is deterministic and pre-scoped, which is also the strongest hallucination control this
pipeline has — the guard can only catch a figure that contradicts the context, so a report generated
from an EMPTY context had no contradiction to find and every number in it was unfalsifiable.

master:4020 was amended on 2026-08-29 to say "context retrieval — relational for figures, RAG for
documents", which is what this file implements.

Structure mirrors risk/context.py exactly: pure `build_*_context` renderers that carry the unit gate,
and `fetch_*` coroutines that go through `tenant_scoped` so RLS sees the tenant GUC. Every query also
carries an explicit `WHERE tenant_id = $1` as defence in depth, never as a replacement for RLS.
"""

from reports.context.executive import assemble_executive_context, build_executive_context
from reports.context.procurement import assemble_procurement_context, build_procurement_context
from reports.context.site import assemble_site_context, build_site_context

__all__ = [
    "assemble_site_context",
    "build_site_context",
    "assemble_procurement_context",
    "build_procurement_context",
    "assemble_executive_context",
    "build_executive_context",
]
