// carbon.record.created.v1 — Phase 24 Digital Twin / Phase 6 CarbonCalculationEngine
// Emitted when a carbon record is generated from material consumption.
// Producer: CarbonCalculationEngine (activates when EN 15804 EPD factors are configured).
// Consumer: analytics-worker carbon module → ClickHouse GHG Protocol Scope 1/2/3.
// Source: docs/specifications/33-digital-twin-iot §33.3
import type { BaseEventEnvelope } from '@cos/types';

export interface CarbonRecordCreatedPayload {
  carbon_record_id: string;
  tenant_id: string;
  project_id: string;
  consumption_id: string;
  material_id: string;
  quantity_consumed: number;
  unit: string;
  carbon_factor: number;
  carbon_factor_source: string;
  carbon_kgco2e: number;
  ghg_scope: 'SCOPE_1' | 'SCOPE_2' | 'SCOPE_3';
  recorded_at: string;
}

export type CarbonRecordCreatedEvent = BaseEventEnvelope<CarbonRecordCreatedPayload>;
