"""
DAG: dag-model-evaluation
Schedule: triggered by training DAGs (post-training evaluation)
Purpose: Evaluate all models on holdout set, log metrics to MLflow, gate promotion.
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.providers.standard.operators.python import PythonOperator

default_args = {
    "owner": "cos-mlops",
    "depends_on_past": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

dag = DAG(
    dag_id="dag-model-evaluation",
    default_args=default_args,
    description="Post-training evaluation: holdout set metrics → MLflow; gates model promotion",
    schedule=None,  # triggered by training DAGs via TriggerDagRunOperator
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["mlops", "evaluation"],
)


def load_holdout_dataset(**context):
    """
    TODO: load holdout parquet files from MinIO for the model being evaluated.
    Model name passed via dag_run.conf['model_name'].
    """
    raise NotImplementedError("load_holdout_dataset — not yet implemented")


def compute_metrics(**context):
    """
    TODO: run inference on holdout set using the newly trained model version.
    - DelayForecastModel: MAE, RMSE
    - RiskClassifier: weighted F1, precision, recall per class
    - SafetyVisionModel: accuracy, AUC-ROC
    - GraphMLModel: AUC-ROC, precision@k
    """
    raise NotImplementedError("compute_metrics — pending load_holdout_dataset")


def log_to_mlflow(**context):
    """
    TODO: log all computed metrics to MLflow run.
    Tag model version with evaluation_status='EVALUATED'.
    """
    raise NotImplementedError("log_to_mlflow — pending compute_metrics")


def quality_gate(**context):
    """
    TODO: compare metrics against quality thresholds.
    If passed: tag model version 'READY_FOR_PROMOTION'.
    If failed: tag 'EVALUATION_FAILED', send Slack alert to #mlops-alerts.
    """
    raise NotImplementedError("quality_gate — pending log_to_mlflow")


t_holdout = PythonOperator(task_id="load_holdout_dataset", python_callable=load_holdout_dataset, dag=dag)
t_metrics = PythonOperator(task_id="compute_metrics", python_callable=compute_metrics, dag=dag)
t_log = PythonOperator(task_id="log_to_mlflow", python_callable=log_to_mlflow, dag=dag)
t_gate = PythonOperator(task_id="quality_gate", python_callable=quality_gate, dag=dag)

t_holdout >> t_metrics >> t_log >> t_gate
