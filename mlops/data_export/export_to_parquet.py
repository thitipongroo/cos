"""
Data export utility: PostgreSQL / ClickHouse → Parquet → MinIO data lake.
Used by dag-export-training-data.
MinIO bucket naming: cos-datalake-{tenant_id}
"""

from __future__ import annotations

import io
import os
from datetime import date
from typing import Any

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import psycopg2
import boto3
from botocore.config import Config


def _get_s3_client() -> Any:
    return boto3.client(
        "s3",
        endpoint_url=os.environ["MINIO_ENDPOINT_URL"],
        aws_access_key_id=os.environ["MINIO_ACCESS_KEY"],
        aws_secret_access_key=os.environ["MINIO_SECRET_KEY"],
        config=Config(signature_version="s3v4"),
    )


def _get_pg_connection() -> psycopg2.extensions.connection:
    return psycopg2.connect(os.environ["POSTGRES_URI"])


def export_table_to_parquet(
    *,
    query: str,
    tenant_id: str,
    dataset_name: str,
    partition_date: date,
    chunk_size: int = 10_000,
) -> dict[str, int]:
    """
    Execute `query` against PostgreSQL, write results as Parquet to MinIO.

    Destination path:
      cos-datalake-{tenant_id}/{dataset_name}/dt={partition_date}/data.parquet

    Returns: {"rows_exported": int, "bytes_written": int}
    """
    bucket = f"cos-datalake-{tenant_id}"
    key = f"{dataset_name}/dt={partition_date.isoformat()}/data.parquet"

    conn = _get_pg_connection()
    try:
        chunks: list[pd.DataFrame] = []
        for chunk in pd.read_sql(query, conn, chunksize=chunk_size):
            chunks.append(chunk)
    finally:
        conn.close()

    if not chunks:
        return {"rows_exported": 0, "bytes_written": 0}

    df = pd.concat(chunks, ignore_index=True)
    table = pa.Table.from_pandas(df, preserve_index=False)

    buf = io.BytesIO()
    pq.write_table(
        table,
        buf,
        compression="snappy",
        row_group_size=50_000,
    )
    buf.seek(0)
    data = buf.read()

    s3 = _get_s3_client()
    s3.put_object(Bucket=bucket, Key=key, Body=data)

    return {"rows_exported": len(df), "bytes_written": len(data)}


# ─── Predefined exports (called from Airflow DAG tasks) ─────────────────────

SITE_REPORTS_QUERY = """
    SELECT
        report_id, project_id, tenant_id,
        reported_at, report_type, status,
        created_by_user_id
    FROM site_report.reports
    WHERE reported_at::date = %(partition_date)s
      AND tenant_id = %(tenant_id)s
"""

COST_HISTORY_QUERY = """
    SELECT
        project_id, tenant_id,
        snapshot_date, budget, actual_cost,
        variance_pct
    FROM analytics.cost_snapshots
    WHERE snapshot_date = %(partition_date)s
      AND tenant_id = %(tenant_id)s
"""

PROCUREMENT_QUERY = """
    SELECT
        po.po_id, po.project_id, po.tenant_id,
        po.created_at::date AS order_date,
        po.expected_delivery_date,
        po.actual_delivery_date,
        rfq.created_at::date AS rfq_date
    FROM procurement.purchase_orders po
    JOIN procurement.rfqs rfq ON rfq.rfq_id = po.rfq_id
    WHERE po.created_at::date = %(partition_date)s
      AND po.tenant_id = %(tenant_id)s
"""

INSPECTION_FAILURES_QUERY = """
    SELECT
        inspection_id, project_id, tenant_id,
        inspected_at::date AS inspection_date,
        result, category
    FROM inspection.site_inspections
    WHERE inspected_at::date = %(partition_date)s
      AND result = 'FAIL'
      AND tenant_id = %(tenant_id)s
"""
