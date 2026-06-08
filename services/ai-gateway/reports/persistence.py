import json
import uuid

import asyncpg


async def persist_report(
    db_pool: asyncpg.Pool,
    tenant_id: str,
    project_id: str,
    report_type: str,
    content: dict,
    confidence: float,
    model_used: str,
    tokens_used: int,
    generated_by: str,
) -> str:
    """Insert one row into ai.ai_generated_reports. Returns report_id."""
    report_id = str(uuid.uuid4())
    await db_pool.execute(
        """
        INSERT INTO ai.ai_generated_reports (
            report_id, tenant_id, project_id, report_type,
            content, confidence, model_used, tokens_used, generated_by
        ) VALUES ($1, $2, $3, $4::ai.report_type_enum,
                  $5::jsonb, $6, $7, $8, $9)
        """,
        report_id,
        tenant_id,
        project_id,
        report_type,
        json.dumps(content),
        confidence,
        model_used,
        tokens_used,
        generated_by,
    )
    return report_id


async def fetch_report_history(
    db_pool: asyncpg.Pool,
    tenant_id: str,
    project_id: str,
    limit: int = 20,
) -> list[dict]:
    rows = await db_pool.fetch(
        """
        SELECT report_id, report_type, confidence, model_used,
               tokens_used, generated_at, generated_by
        FROM ai.ai_generated_reports
        WHERE tenant_id = $1
          AND project_id = $2
        ORDER BY generated_at DESC
        LIMIT $3
        """,
        tenant_id,
        project_id,
        limit,
    )
    return [dict(r) for r in rows]
