"""
DAG: dag-update-feature-store
Schedule: daily
Purpose: Refresh Feast feature views from PostgreSQL/ClickHouse → Redis online store.
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.providers.standard.operators.python import PythonOperator

default_args = {
    "owner": "cos-mlops",
    "depends_on_past": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=3),
}

dag = DAG(
    dag_id="dag-update-feature-store",
    default_args=default_args,
    description="Daily refresh of Feast feature views → Redis online store",
    schedule="@daily",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["mlops", "feature-store", "feast"],
)


def materialize_project_features(**context):
    """
    TODO: run `feast materialize-incremental` for project_features view.
    Features: budget_variance, days_to_deadline, open_issue_count.
    Offline source: PostgreSQL (existing RDS). Online store: Redis.
    """
    raise NotImplementedError("materialize_project_features — Feast not yet materialized")


def materialize_procurement_features(**context):
    """
    TODO: run `feast materialize-incremental` for procurement_features view.
    Features: avg_delivery_delay, rfq_to_po_days, overdue_invoice_count.
    """
    raise NotImplementedError("materialize_procurement_features — Feast not yet materialized")


def materialize_site_features(**context):
    """
    TODO: run `feast materialize-incremental` for site_features view.
    Features: manpower_7d_avg, inspection_fail_rate, report_submission_rate.
    """
    raise NotImplementedError("materialize_site_features — Feast not yet materialized")


def verify_feature_store(**context):
    """
    TODO: verify Redis has fresh feature values for each entity type.
    Log staleness metric to Prometheus.
    """
    raise NotImplementedError("verify_feature_store — pending materialization tasks")


t_proj = PythonOperator(
    task_id="materialize_project_features",
    python_callable=materialize_project_features,
    dag=dag,
)

t_proc = PythonOperator(
    task_id="materialize_procurement_features",
    python_callable=materialize_procurement_features,
    dag=dag,
)

t_site = PythonOperator(
    task_id="materialize_site_features",
    python_callable=materialize_site_features,
    dag=dag,
)

t_verify = PythonOperator(
    task_id="verify_feature_store",
    python_callable=verify_feature_store,
    dag=dag,
)

[t_proj, t_proc, t_site] >> t_verify
