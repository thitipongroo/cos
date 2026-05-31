// EP-INFRA-005: DebeziumCDCPipeline
// Source: context/00_master_construction_os.md §Phase 8 DATA FLOW ARCHITECTURE Path 2
// Trigger: Phase 17 DevOps setup (data lake infrastructure ready)
// Path 2: PostgreSQL WAL → Debezium CDC → Kafka → Kafka Connect S3 Sink → Data Lake (S3 + Iceberg)
// Note: Debezium reads PostgreSQL WAL directly — NOT a Kafka consumer.
//       This is separate from the Outbox Pattern (Path 1).

import { StubBase } from '../stub-base';

export interface DebeziumConnectorConfig {
  pgHost: string;
  pgPort: number;
  pgDatabase: string;
  pgUsername: string;
  kafkaBrokers: string[];
  schemaRegistryUrl: string;
  topicPrefix: string;
}

export class DebeziumCDCPipeline extends StubBase {
  readonly EP_ID = 'EP-INFRA-005';
  readonly EP_VERSION = '0.1.0';
  readonly TRIGGER = 'Phase 17 DevOps setup — data lake infrastructure (S3 + Iceberg) is ready';
  readonly PHASE = 'Phase 8 (stub) — implement with Phase 17';

  async configureDebeziumConnector(
    pgSource: DebeziumConnectorConfig,
    _kafkaSink: { topicPrefix: string },
  ): Promise<void> {
    this.logStubCall('configureDebeziumConnector', { pgHost: pgSource.pgHost });
    // Implementation: POST to Kafka Connect REST API to register Debezium PostgreSQL connector
    // Candidates: Debezium 2.x + Kafka Connect 3.x
    // Required by spec §4.4 and §9.4; data lake (Iceberg) depends on this path
  }
}
