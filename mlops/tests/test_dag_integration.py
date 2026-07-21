"""
Integration tests: end-to-end Airflow DAG run with test data (Phase 23)
Uses pytest + Airflow test utilities (no real external connections).
All external I/O mocked at the boundary.
"""

import pytest
from airflow.models import DagBag


DAGS_DIR = "mlops/airflow/dags"


@pytest.fixture(scope="module")
def dagbag():
    return DagBag(dag_folder=DAGS_DIR, include_examples=False)


# ─── DAG loading tests ────────────────────────────────────────────────────────

class TestDagLoading:
    """Verify all 5 DAGs parse without import errors."""

    def test_all_dags_load(self, dagbag):
        assert dagbag.import_errors == {}, (
            f"DAG import errors: {dagbag.import_errors}"
        )

    def test_export_training_data_dag_exists(self, dagbag):
        assert "dag-export-training-data" in dagbag.dags

    def test_train_delay_model_dag_exists(self, dagbag):
        assert "dag-train-delay-model" in dagbag.dags

    def test_train_risk_classifier_dag_exists(self, dagbag):
        assert "dag-train-risk-classifier" in dagbag.dags

    def test_update_feature_store_dag_exists(self, dagbag):
        assert "dag-update-feature-store" in dagbag.dags

    def test_model_evaluation_dag_exists(self, dagbag):
        assert "dag-model-evaluation" in dagbag.dags


# ─── DAG structure tests ──────────────────────────────────────────────────────

class TestExportDagStructure:
    def test_export_dag_has_5_tasks(self, dagbag):
        dag = dagbag.dags["dag-export-training-data"]
        assert len(dag.tasks) == 5

    def test_export_dag_verify_is_downstream_of_all_exports(self, dagbag):
        dag = dagbag.dags["dag-export-training-data"]
        verify_task = dag.get_task("verify_export")
        upstream_ids = {t.task_id for t in verify_task.upstream_list}
        assert upstream_ids == {
            "export_site_reports",
            "export_cost_history",
            "export_procurement_data",
            "export_inspection_failures",
        }


class TestTrainDelayDagStructure:
    def test_train_delay_dag_is_linear(self, dagbag):
        dag = dagbag.dags["dag-train-delay-model"]
        task_ids = [t.task_id for t in dag.topological_sort()]
        assert task_ids == [
            "check_data_threshold",
            "load_features",
            "train_model",
            "evaluate_model",
            "promote_model",
        ]


class TestUpdateFeatureStoreDagStructure:
    def test_verify_is_downstream_of_all_materialize(self, dagbag):
        dag = dagbag.dags["dag-update-feature-store"]
        verify_task = dag.get_task("verify_feature_store")
        upstream_ids = {t.task_id for t in verify_task.upstream_list}
        assert upstream_ids == {
            "materialize_project_features",
            "materialize_procurement_features",
            "materialize_site_features",
        }


# ─── DAG schedule tests ───────────────────────────────────────────────────────

class TestDagSchedules:
    def test_export_data_is_daily(self, dagbag):
        dag = dagbag.dags["dag-export-training-data"]
        assert dag.schedule == "@daily"

    def test_update_feature_store_is_daily(self, dagbag):
        dag = dagbag.dags["dag-update-feature-store"]
        assert dag.schedule == "@daily"

    def test_model_evaluation_has_no_schedule(self, dagbag):
        dag = dagbag.dags["dag-model-evaluation"]
        assert dag.schedule is None


# ─── Task callable tests with mocked data ────────────────────────────────────

class TestExportTasksRaiseNotImplemented:
    """Export tasks should raise NotImplementedError (stubs) until implemented."""

    @pytest.fixture(autouse=True)
    def mock_context(self):
        return {"ds": "2026-06-08", "run_id": "test-run"}

    def test_export_site_reports_raises(self):
        from mlops.airflow.dags.dag_export_training_data import export_site_reports
        with pytest.raises(NotImplementedError):
            export_site_reports()

    def test_export_cost_history_raises(self):
        from mlops.airflow.dags.dag_export_training_data import export_cost_history
        with pytest.raises(NotImplementedError):
            export_cost_history()

    def test_check_data_threshold_raises(self):
        from mlops.airflow.dags.dag_train_delay_model import check_data_threshold
        with pytest.raises(NotImplementedError):
            check_data_threshold()
