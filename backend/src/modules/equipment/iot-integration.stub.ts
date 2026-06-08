// IoT Integration stub — Phase 21
// Trigger: fleet includes GPS-tracked equipment or machinery with onboard telematics
// IoT platform: EMQX self-hosted on EKS (MQTT broker) → MSK Kafka connector
// Pipeline: IoT device → MQTT broker (EMQX) → Kafka (MSK) → TimescaleDB hypertable
// Implement when: fleet with IoT sensors is onboarded (Phase 21 trigger condition)

export interface TelemetryEvent {
  equipmentId: string;
  tenantId: string;
  timestamp: Date;
  eventType:
    | 'GPS_POSITION'
    | 'FUEL_LEVEL'
    | 'ENGINE_HOURS'
    | 'IGNITION_ON'
    | 'IGNITION_OFF'
    | 'IDLE_ALERT'
    | 'GEOFENCE_BREACH';
  payload: Record<string, unknown>;
}

export interface IoTIntegrationPort {
  streamTelemetry(equipmentId: string, tenantId: string): AsyncIterable<TelemetryEvent>;
}

export class IoTIntegrationStub implements IoTIntegrationPort {
  async *streamTelemetry(_equipmentId: string, _tenantId: string): AsyncIterable<TelemetryEvent> {
    // Not implemented — IoT sensors not yet onboarded
  }
}
