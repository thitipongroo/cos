"""
DAG: dag-export-training-data
Schedule: daily
Purpose: Export operational data (PostgreSQL / ClickHouse) to MinIO data lake as Parquet.

TODO: implement each task when data thresholds are met (Phase 23+ production data).
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.providers.standard.operators.python import PythonOperator

default_args = {
    "owner": "cos-mlops",
    "depends_on_past": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}

dag = DAG(
    dag_id="dag-export-training-data",
    default_args=default_args,
    description="Daily export: PostgreSQL/ClickHouse → MinIO data lake (Parquet)",
    schedule="@daily",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["mlops", "data-export"],
)


def export_site_reports(**context):
    """
    TODO: query site_reports from PostgreSQL, write as Parquet to
    MinIO bucket cos-datalake-{tenant_id}/site_reports/dt={ds}/
    Uses: pandas + pyarrow (see mlops/data_export/export_to_parquet.py)
    """
    raise NotImplementedError("export_site_reports — not yet implemented")


def export_cost_history(**context):
    """
    TODO: query cost_history from ClickHouse analytics tables,
    write as Parquet to cos-datalake-{tenant_id}/cost_history/dt={ds}/
    """
    raise NotImplementedError("export_cost_history — not yet implemented")


def export_procurement_data(**context):
    """
    TODO: query procurement tables from PostgreSQL,
    write as Parquet to cos-datalake-{tenant_id}/procurement/dt={ds}/
    """
    raise NotImplementedError("export_procurement_data — not yet implemented")


def export_inspection_failures(**context):
    """
    TODO: query inspection_failures from PostgreSQL,
    write as Parquet to cos-datalake-{tenant_id}/inspections/dt={ds}/
    """
    raise NotImplementedError("export_inspection_failures — not yet implemented")


def verify_export(**context):
    """
    TODO: verify parquet files written successfully to MinIO,
    log row counts to MLflow for data drift detection baseline.
    """
    raise NotImplementedError("verify_export — not yet implemented")


t_site_reports = PythonOperator(
    task_id="export_site_reports",
    python_callable=export_site_reports,
    dag=dag,
)

t_cost_history = PythonOperator(
    task_id="export_cost_history",
    python_callable=export_cost_history,
    dag=dag,
)

t_procurement = PythonOperator(
    task_id="export_procurement_data",
    python_callable=export_procurement_data,
    dag=dag,
)

t_inspections = PythonOperator(
    task_id="export_inspection_failures",
    python_callable=export_inspection_failures,
    dag=dag,
)

t_verify = PythonOperator(
    task_id="verify_export",
    python_callable=verify_export,
    dag=dag,
)

[t_site_reports, t_cost_history, t_procurement, t_inspections] >> t_verify
