"""
Unit tests: Airflow DAG task functions (Phase 23)
Tests use mocked data sources — no real PostgreSQL / MinIO / Feast calls.
"""

import pytest
from datetime import date
from unittest.mock import MagicMock, patch


# ─── export_to_parquet tests ─────────────────────────────────────────────────

class TestExportToParquet:
    """Tests for mlops/data_export/export_to_parquet.py."""

    def test_export_writes_parquet_to_minio(self, monkeypatch):
        import pandas as pd

        mock_df = pd.DataFrame({
            "report_id": ["r1", "r2"],
            "project_id": ["p1", "p2"],
            "tenant_id": ["t1", "t1"],
        })

        mock_conn = MagicMock()
        mock_s3 = MagicMock()

        monkeypatch.setenv("MINIO_ENDPOINT_URL", "http://localhost:9000")
        monkeypatch.setenv("MINIO_ACCESS_KEY", "test")
        monkeypatch.setenv("MINIO_SECRET_KEY", "test")
        monkeypatch.setenv("POSTGRES_URI", "postgresql://test:test@localhost/test")

        with patch("mlops.data_export.export_to_parquet._get_pg_connection", return_value=mock_conn), \
             patch("mlops.data_export.export_to_parquet._get_s3_client", return_value=mock_s3), \
             patch("pandas.read_sql", return_value=iter([mock_df])):

            from mlops.data_export.export_to_parquet import export_table_to_parquet
            result = export_table_to_parquet(
                query="SELECT * FROM test",
                tenant_id="tenant-1",
                dataset_name="site_reports",
                partition_date=date(2026, 6, 8),
            )

        assert result["rows_exported"] == 2
        assert result["bytes_written"] > 0
        mock_s3.put_object.assert_called_once()
        call_kwargs = mock_s3.put_object.call_args.kwargs
        assert call_kwargs["Bucket"] == "cos-datalake-tenant-1"
        assert "site_reports/dt=2026-06-08" in call_kwargs["Key"]

    def test_export_returns_zero_when_no_rows(self, monkeypatch):

        mock_conn = MagicMock()
        mock_s3 = MagicMock()

        monkeypatch.setenv("MINIO_ENDPOINT_URL", "http://localhost:9000")
        monkeypatch.setenv("MINIO_ACCESS_KEY", "test")
        monkeypatch.setenv("MINIO_SECRET_KEY", "test")
        monkeypatch.setenv("POSTGRES_URI", "postgresql://test:test@localhost/test")

        with patch("mlops.data_export.export_to_parquet._get_pg_connection", return_value=mock_conn), \
             patch("mlops.data_export.export_to_parquet._get_s3_client", return_value=mock_s3), \
             patch("pandas.read_sql", return_value=iter([])):

            from mlops.data_export.export_to_parquet import export_table_to_parquet
            result = export_table_to_parquet(
                query="SELECT * FROM test WHERE 1=0",
                tenant_id="tenant-1",
                dataset_name="site_reports",
                partition_date=date(2026, 6, 8),
            )

        assert result["rows_exported"] == 0
        assert result["bytes_written"] == 0
        mock_s3.put_object.assert_not_called()


# ─── Model stub tests ─────────────────────────────────────────────────────────

class TestModelStubs:
    """Verify all model stubs raise NotImplementedError (data threshold not met)."""

    def test_delay_forecast_model_raises(self):
        from mlops.models.delay_forecast_model import DelayForecastModel, DelayFeatures
        model = DelayForecastModel()
        with pytest.raises(NotImplementedError):
            model.predict(DelayFeatures(
                weather="sunny",
                workforce_count=50,
                procurement_delay_days=5.0,
                historical_velocity=0.8,
                days_to_deadline=30,
            ))

    def test_safety_vision_model_raises(self):
        from mlops.models.safety_vision_model import SafetyVisionModel
        model = SafetyVisionModel()
        with pytest.raises(NotImplementedError):
            model.analyze("s3://bucket/photo.jpg")

    def test_graph_ml_model_raises(self):
        from mlops.models.graph_ml_model import GraphMLModel
        model = GraphMLModel()
        with pytest.raises(NotImplementedError):
            model.infer_relationship("vendor-1", "project-1", "supplier")

    def test_risk_classifier_raises(self):
        from mlops.models.risk_classifier import RiskClassifier, ProjectFeatures
        classifier = RiskClassifier()
        with pytest.raises(NotImplementedError):
            classifier.classify(ProjectFeatures(
                budget_variance=0.15,
                schedule_delay_pct=0.10,
                overdue_invoice_count=3,
                safety_incident_count=1,
                open_issue_count=12,
            ))


# ─── Interface stub tests ─────────────────────────────────────────────────────

class TestInterfaceStubs:
    def test_model_registry_stub_raises(self):
        from mlops.interfaces.model_registry import ModelRegistryStub
        stub = ModelRegistryStub()
        with pytest.raises(NotImplementedError):
            stub.register_model("model-name", "1", "s3://bucket/artifact")

    def test_feature_store_stub_raises(self):
        from mlops.interfaces.feature_store import FeatureStoreStub
        stub = FeatureStoreStub()
        with pytest.raises(NotImplementedError):
            stub.get_online_features([{"project_id": "p1"}])

    def test_autonomous_executor_stub_raises(self):
        from mlops.interfaces.autonomous_workflow_executor import AutonomousWorkflowExecutorStub
        stub = AutonomousWorkflowExecutorStub()
        with pytest.raises(NotImplementedError):
            stub.execute("notify", {}, "tenant-1")

    def test_experiment_monitoring_stub_raises(self):
        from mlops.interfaces.experiment_monitoring import ExperimentMonitoringStub
        stub = ExperimentMonitoringStub()
        with pytest.raises(NotImplementedError):
            stub.log_run("test-experiment", {"mae": 0.5}, {"n_estimators": 100})
