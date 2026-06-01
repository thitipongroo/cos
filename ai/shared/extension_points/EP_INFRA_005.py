"""
EP-INFRA-005 — DebeziumCDCPipeline
Phase 8 stub — Path 2 data lake replication via Debezium CDC.

Source: context/00_master_construction_os.md §Phase 8 DATA FLOW ARCHITECTURE Path 2
Spec:   docs/specifications/ §4.4, §9.4 (M-6 resolved 2026-05-27)

Trigger: Phase 17 (data lake infrastructure ready — S3 + Apache Iceberg + ClickHouse)
DECIDED: Debezium 2.x + Kafka Connect 3.x

Path 2 data flow:
  PostgreSQL WAL → Debezium CDC → Kafka → Kafka Connect S3 Sink
  → Data Lake (S3 + Apache Iceberg) → ClickHouse → AI Pipeline / Analytics

Note: Debezium reads PostgreSQL WAL DIRECTLY — NOT a Kafka consumer.
      This is independent of the Outbox Pattern (Path 1 business events).
      Path 2 captures ALL row-level changes (including direct DB writes that
      bypass the application event bus), providing full data fidelity in the lake.
"""

from dataclasses import dataclass
from typing import Any

from ai.shared.stub_base import StubBase


@dataclass
class PostgresSourceConfig:
    host: str
    port: int
    database: str
    username: str
    password_secret_ref: str  # AWS SM / Vault secret path
    tables: list[str]  # e.g. ["platform.users", "procurement.purchase_orders"]
    slot_name: str


@dataclass
class KafkaSinkConfig:
    bootstrap_servers: str
    topic_prefix: str  # e.g. "cdc." → topics: cdc.platform.users
    schema_registry_url: str


class DebeziumCDCPipeline(StubBase):
    """
    Configures a Debezium PostgreSQL source connector + Kafka Connect S3 sink
    for full row-level change data capture to the data lake.

    Implement in Phase 17 when data lake infrastructure (S3 + Apache Iceberg)
    is provisioned via Terraform.
    """

    EP_ID = "EP-INFRA-005"
    EP_VERSION = "0.1.0"
    TRIGGER = "Phase 17: data lake infrastructure ready (S3 + Apache Iceberg + ClickHouse)"
    PHASE = "Stage 3 — Multi-company Enterprise (Phase 17)"

    def configure_debezium_connector(
        self,
        pg_source: PostgresSourceConfig,
        kafka_sink: KafkaSinkConfig,
    ) -> dict[str, Any]:
        """
        Register Debezium PostgreSQL source connector with Kafka Connect REST API.
        Returns the connector configuration submitted to Kafka Connect.
        Safe default: returns empty dict (no connector created).
        """
        self.log_stub_call(
            "configure_debezium_connector",
            {"pg_host": pg_source.host, "topic_prefix": kafka_sink.topic_prefix},
        )
        return {}

    def get_connector_status(self, connector_name: str) -> dict[str, Any]:
        """
        Query Kafka Connect REST API for connector + task status.
        Safe default: returns empty dict.
        """
        self.log_stub_call("get_connector_status", {"connector_name": connector_name})
        return {}

    def pause_connector(self, connector_name: str) -> None:
        """Pause CDC replication (e.g. during schema migration). Safe default: no-op."""
        self.log_stub_call("pause_connector", {"connector_name": connector_name})

    def resume_connector(self, connector_name: str) -> None:
        """Resume CDC replication after migration. Safe default: no-op."""
        self.log_stub_call("resume_connector", {"connector_name": connector_name})
