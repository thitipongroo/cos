"""
Feast feature view: site_features
Entity: project (project_id UUID)
Features: manpower_7d_avg, inspection_fail_rate, report_submission_rate
Offline source: PostgreSQL / TimescaleDB hypertables
"""

from datetime import timedelta
from feast import Entity, FeatureView, Field
from feast.types import Float64
from feast.infra.offline_stores.contrib.postgres_offline_store.postgres_source import PostgreSQLSource

from project_features import project_entity  # shared entity

site_feature_source = PostgreSQLSource(
    name="site_feature_source",
    query="""
        SELECT
            pw.project_id,
            AVG(daily_headcount.cnt)::FLOAT                     AS manpower_7d_avg,
            (COUNT(*) FILTER (WHERE si.result = 'FAIL')
              / NULLIF(COUNT(*), 0)::FLOAT)                     AS inspection_fail_rate,
            (COUNT(*) FILTER (WHERE sr.submitted_at IS NOT NULL)
              / NULLIF(COUNT(DISTINCT sr.required_date), 0)::FLOAT) AS report_submission_rate,
            NOW() AS event_timestamp
        FROM workforce.project_workforce pw
        LEFT JOIN (
            SELECT project_id, DATE(recorded_at) AS day, COUNT(DISTINCT worker_id) AS cnt
            FROM workforce_telemetry.attendance_logs
            WHERE recorded_at >= NOW() - INTERVAL '7 days'
            GROUP BY project_id, day
        ) daily_headcount ON daily_headcount.project_id = pw.project_id
        LEFT JOIN inspection.site_inspections si ON si.project_id = pw.project_id
            AND si.inspected_at >= NOW() - INTERVAL '30 days'
        LEFT JOIN site_report.reports sr ON sr.project_id = pw.project_id
            AND sr.required_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY pw.project_id
    """,
    timestamp_field="event_timestamp",
)

site_features = FeatureView(
    name="site_features",
    entities=[project_entity],
    ttl=timedelta(hours=24),
    schema=[
        Field(name="manpower_7d_avg", dtype=Float64),
        Field(name="inspection_fail_rate", dtype=Float64),
        Field(name="report_submission_rate", dtype=Float64),
    ],
    source=site_feature_source,
    tags={"team": "mlops", "model": "delay-forecast,risk-classifier"},
)
