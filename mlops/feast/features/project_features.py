"""
Feast feature view: project_features
Entity: project (project_id UUID)
Features: budget_variance, days_to_deadline, open_issue_count
Offline source: PostgreSQL view (feast_offline.project_feature_source)
"""

from datetime import timedelta
from feast import Entity, FeatureView, Field, PushSource
from feast.types import Float64, Int64, String
from feast.infra.offline_stores.contrib.postgres_offline_store.postgres_source import PostgreSQLSource

project_entity = Entity(
    name="project",
    join_keys=["project_id"],
    description="Construction project entity",
)

project_feature_source = PostgreSQLSource(
    name="project_feature_source",
    query="""
        SELECT
            project_id,
            tenant_id,
            CAST((actual_cost - budget) / NULLIF(budget, 0) AS FLOAT) AS budget_variance,
            EXTRACT(DAY FROM (planned_end_date - NOW()))::INT         AS days_to_deadline,
            open_issue_count::INT                                     AS open_issue_count,
            updated_at                                                AS event_timestamp
        FROM analytics.project_summary_view
        WHERE updated_at >= CURRENT_DATE - INTERVAL '90 days'
    """,
    timestamp_field="event_timestamp",
)

project_features = FeatureView(
    name="project_features",
    entities=[project_entity],
    ttl=timedelta(hours=24),
    schema=[
        Field(name="budget_variance", dtype=Float64),
        Field(name="days_to_deadline", dtype=Int64),
        Field(name="open_issue_count", dtype=Int64),
    ],
    source=project_feature_source,
    tags={"team": "mlops", "model": "delay-forecast,risk-classifier"},
)
