"""
DAG: dag-train-device-trust-model
Schedule: weekly (Sunday 05:00)
Purpose: Retrain DeviceTrustModel and attempt promotion against the rule-based baseline (ADR-081).

NO check_data_threshold TASK, and its absence is the point. The other four training DAGs open with
one because §22.6 gives them a row count ("90+ days", "10,000+ photos"). DeviceTrustModel has none:
its positive class is "device later revoked as compromised", which is rare by design in a fleet where
trust is earned and revocation is manual, so a count trigger would fire on calendar time while the
positive class was still nearly empty. The gate is compute_baseline -> evaluate -> promote, and
promotion happens only on a PR-AUC margin over the baseline.

compute_baseline RUNS BEFORE TRAINING, not after. The baseline is the control, and a control computed
after seeing the model's numbers is not one.

TODO: implement each task when the label set is non-empty.
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
    dag_id="dag-train-device-trust-model",
    default_args=default_args,
    description=(
        "Weekly retraining of DeviceTrustModel (XGBoost binary); promoted only on PR-AUC over the "
        "rule-based baseline (ADR-081)"
    ),
    schedule="0 5 * * 0",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["mlops", "training", "device-trust-model"],
)


def load_labels(**context):
    """
    TODO: read the label set from the data lake.

    Positive class: platform.trusted_devices rows with revocation_reason = 'COMPROMISED'.
    ONLY that value. The other three (USER_REVOKED, ADMIN_REVOKED, LOST_OR_STOLEN) are ordinary fleet
    churn, and treating them as compromises would teach the model that retiring a phone looks like an
    attack — every replaced handset would then drag its owner's next device down.

    Rows revoked before migration 20260805000001 carry a NULL reason and are neither confirmed
    compromises nor confirmed benign; they must be EXCLUDED rather than defaulted either way.
    """
    raise NotImplementedError("load_labels — needs COMPROMISED revocations in the data lake")


def load_features(**context):
    """
    TODO: assemble the feature rows matching mlops.models.device_trust_baseline.TrustFeatures.

    Point-in-time correctness is the whole difficulty: every feature must be as of the moment the
    device was scored, never as of today. `enrolment_age_days` computed against the export date
    rather than the scoring date would leak the future into the training set and produce a model
    that looks excellent offline and is worthless in production.
    """
    raise NotImplementedError("load_features — Feast point-in-time join not yet configured")


def compute_baseline(**context):
    """
    TODO: score the held-out set with mlops.models.device_trust_baseline.baseline_probability and
    log its PR-AUC to MLflow as the control this run must beat.

    Use baseline_probability, NOT score_device: PR-AUC is computed over a ranking and both sides must
    rank the same direction. The positive class is "compromised" while a HIGH trust score means the
    opposite, so the sign convention lives in that one function — reversed here, a promotion decision
    flips.
    """
    raise NotImplementedError("compute_baseline — pending load_features")


def train_model(**context):
    """
    TODO: train the XGBoost binary classifier, then CALIBRATE it (sklearn CalibratedClassifierCV or
    equivalent) — §22.6 renders a calibrated probability 0-100, and an uncalibrated boosted-tree
    score is not a probability. A number displayed as "87%" on a security screen has to mean 87%.

    Log runs and metrics to MLflow Tracking; drift via Evidently AI (ADR-038).
    """
    raise NotImplementedError("train_model — pending load_labels and load_features")


def evaluate_model(**context):
    """
    TODO: compute PR-AUC on the SAME held-out split compute_baseline used, and log both to MLflow.

    PR-AUC, not ROC-AUC and not accuracy. Under this class imbalance ROC-AUC stays flattering while
    the model is useless on the positive class, and accuracy is maximised by predicting "trusted"
    every time — which is the 98%-for-everyone failure ADR-081 removed.
    """
    raise NotImplementedError("evaluate_model — pending train_model")


def promote_model(**context):
    """
    TODO: promote to MLflow 'Production' ONLY when PR-AUC exceeds the baseline's on the held-out set.

    On promotion, two things must happen together or neither happens:
      - the model card at docs/ai-governance/model-cards/device-trust-model.md records the PR-AUC
        margin that authorised it (§22.9 — the model may not be deployed without it), and
      - the serving surface starts reporting scoredBy = MODEL, because ADR-081 forbids describing the
        score as AI-derived while the rules are serving.

    No promotion is the NORMAL outcome, not a failure: ADR-081 accepts that the model may never pass
    its gate, and the baseline is a permanent path rather than scaffolding.
    """
    raise NotImplementedError("promote_model — pending evaluate_model")


t_labels = PythonOperator(task_id="load_labels", python_callable=load_labels, dag=dag)
t_features = PythonOperator(task_id="load_features", python_callable=load_features, dag=dag)
t_baseline = PythonOperator(task_id="compute_baseline", python_callable=compute_baseline, dag=dag)
t_train = PythonOperator(task_id="train_model", python_callable=train_model, dag=dag)
t_eval = PythonOperator(task_id="evaluate_model", python_callable=evaluate_model, dag=dag)
t_promote = PythonOperator(task_id="promote_model", python_callable=promote_model, dag=dag)

t_labels >> t_features >> t_baseline >> t_train >> t_eval >> t_promote
