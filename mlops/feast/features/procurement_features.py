"""
Feast feature view: procurement_features
Entity: project (project_id UUID)
Features: avg_delivery_delay, rfq_to_po_days, overdue_invoice_count
Offline source: PostgreSQL view (feast_offline.procurement_feature_source)
"""

from datetime import timedelta
from feast import FeatureView, Field
from feast.types import Float64, Int64
from feast.infra.offline_stores.contrib.postgres_offline_store.postgres_source import PostgreSQLSource

from project_features import project_entity  # shared entity

procurement_feature_source = PostgreSQLSource(
    name="procurement_feature_source",
    query="""
        SELECT
            pr.project_id,
            AVG(EXTRACT(DAY FROM (po.actual_delivery_date - po.expected_delivery_date)))::FLOAT
                AS avg_delivery_delay,
            AVG(EXTRACT(DAY FROM (po.created_at - rfq.created_at)))::FLOAT
                AS rfq_to_po_days,
            COUNT(inv.invoice_id) FILTER (WHERE inv.due_date < NOW() AND inv.status != 'PAID')::INT
                AS overdue_invoice_count,
            MAX(pr.updated_at) AS event_timestamp
        FROM procurement.purchase_orders po
        JOIN procurement.rfqs rfq ON rfq.rfq_id = po.rfq_id
        JOIN procurement.projects pr ON pr.project_id = po.project_id
        LEFT JOIN finance.invoices inv ON inv.project_id = pr.project_id
        WHERE pr.updated_at >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY pr.project_id
    """,
    timestamp_field="event_timestamp",
)

procurement_features = FeatureView(
    name="procurement_features",
    entities=[project_entity],
    ttl=timedelta(hours=24),
    schema=[
        Field(name="avg_delivery_delay", dtype=Float64),
        Field(name="rfq_to_po_days", dtype=Float64),
        Field(name="overdue_invoice_count", dtype=Int64),
    ],
    source=procurement_feature_source,
    tags={"team": "mlops", "model": "delay-forecast,risk-classifier"},
)
