"""
DAG: dag-train-risk-classifier
Schedule: weekly (Sunday 04:00)
Purpose: Retrain RiskClassifier (XGBoost multi-class) when 50+ projects with full lifecycle exist.

TODO: implement each task after data threshold is met.
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator

default_args = {
    "owner": "cos-mlops",
    "depends_on_past": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=10),
}

dag = DAG(
    dag_id="dag-train-risk-classifier",
    default_args=default_args,
    description="Weekly retraining of RiskClassifier (XGBoost multi-class LOW/MEDIUM/HIGH/CRITICAL)",
    schedule_interval="0 4 * * 0",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["mlops", "training", "risk-classifier"],
)


def check_data_threshold(**context):
    """
    TODO: verify >= 50 projects with full lifecycle data exist.
    If not met: raise AirflowSkipException.
    """
    raise NotImplementedError("check_data_threshold — need 50+ projects with full lifecycle")


def load_features(**context):
    """
    TODO: retrieve project_features from Feast offline store.
    Features: budget_variance, schedule_delay_pct, procurement_status,
              safety_incident_count, open_issue_count.
    """
    raise NotImplementedError("load_features — Feast not yet configured for training")


def train_classifier(**context):
    """
    TODO: train XGBoost multi-class classifier (LOW/MEDIUM/HIGH/CRITICAL).
    Log to W&B Cloud and MLflow.
    Algorithm: XGBoost multi-class; source: spec §22-ai-architecture §22.7 ML Models.
    """
    raise NotImplementedError("train_classifier — RiskClassifier training not yet active")


def evaluate_classifier(**context):
    """
    TODO: evaluate on holdout set, compute weighted F1 score.
    Log metrics to MLflow.
    """
    raise NotImplementedError("evaluate_classifier — pending train_classifier implementation")


def promote_classifier(**context):
    """
    TODO: promote to MLflow 'Production' stage if F1 >= quality gate threshold.
    Update AI Gateway model endpoint.
    """
    raise NotImplementedError("promote_classifier — pending evaluate_classifier implementation")


t_check = PythonOperator(task_id="check_data_threshold", python_callable=check_data_threshold, dag=dag)
t_features = PythonOperator(task_id="load_features", python_callable=load_features, dag=dag)
t_train = PythonOperator(task_id="train_classifier", python_callable=train_classifier, dag=dag)
t_eval = PythonOperator(task_id="evaluate_classifier", python_callable=evaluate_classifier, dag=dag)
t_promote = PythonOperator(task_id="promote_classifier", python_callable=promote_classifier, dag=dag)

t_check >> t_features >> t_train >> t_eval >> t_promote
