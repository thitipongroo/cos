"""
DAG: dag-train-delay-model
Schedule: weekly (Sunday 02:00)
Purpose: Retrain DelayForecastModel (XGBoost regressor) when 90+ days of production data exist.

TODO: implement each task after data threshold is met (Phase 23+ production data).
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.providers.standard.operators.python import PythonOperator

default_args = {
    "owner": "cos-mlops",
    "depends_on_past": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=10),
}

dag = DAG(
    dag_id="dag-train-delay-model",
    default_args=default_args,
    description="Weekly retraining of DelayForecastModel (XGBoost regressor)",
    schedule="0 2 * * 0",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["mlops", "training", "delay-model"],
)


def check_data_threshold(**context):
    """
    TODO: verify >= 90 days of site_reports and attendance_logs exist in MinIO.
    If not met: skip DAG gracefully (raise AirflowSkipException).
    """
    raise NotImplementedError("check_data_threshold — data threshold not yet met")


def load_features(**context):
    """
    TODO: call Feast online/offline store to retrieve project_features,
    procurement_features, site_features for training window.
    Features: weather, workforce_count, procurement_delay_days,
              historical_velocity, days_to_deadline.
    """
    raise NotImplementedError("load_features — Feast not yet configured for training")


def train_model(**context):
    """
    TODO: train XGBoost regressor using loaded features.
    Log experiment metrics to MLflow Tracking (ExperimentMonitoring.logRun); evaluation via Evidently AI.
    Log run to MLflow (ModelRegistry.registerModel).
    Algorithm: XGBoost regressor; source: spec §22-ai-architecture §22.6 ML Models.
    """
    raise NotImplementedError("train_model — DelayForecastModel training not yet active")


def evaluate_model(**context):
    """
    TODO: evaluate on holdout set, compute MAE and RMSE.
    Log metrics to MLflow. Trigger dag-model-evaluation DAG for full evaluation.
    """
    raise NotImplementedError("evaluate_model — pending train_model implementation")


def promote_model(**context):
    """
    TODO: if evaluation passes quality gate (MAE < threshold),
    promote model to MLflow 'Production' stage and update AI Gateway endpoint.
    """
    raise NotImplementedError("promote_model — pending evaluate_model implementation")


t_check = PythonOperator(task_id="check_data_threshold", python_callable=check_data_threshold, dag=dag)
t_features = PythonOperator(task_id="load_features", python_callable=load_features, dag=dag)
t_train = PythonOperator(task_id="train_model", python_callable=train_model, dag=dag)
t_eval = PythonOperator(task_id="evaluate_model", python_callable=evaluate_model, dag=dag)
t_promote = PythonOperator(task_id="promote_model", python_callable=promote_model, dag=dag)

t_check >> t_features >> t_train >> t_eval >> t_promote
