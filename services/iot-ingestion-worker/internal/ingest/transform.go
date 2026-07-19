// IoT telemetry → Kafka transform (spec §33.3 write path).
//
// The IoT Ingestion Worker bridges the MQTT broker (EMQX) to Kafka: it subscribes to
// cos/v1/devices/{device_id}/telemetry, and for each message produces a Kafka event the Digital
// Twin Service consumes. This file is the pure transform — MQTT topic + payload in, Kafka topic +
// event out — so it is unit-testable without a broker or Kafka.
//
// MOCK-VERIFIED ONLY at the transport layer: there is no EMQX broker in the stack and no physical
// device, so the real MQTT→Kafka path has never run. The transform logic below is unit-tested.
package ingest

import (
	"encoding/json"
	"fmt"
	"strings"
)

// TelemetryEvent is the Kafka event emitted for one telemetry message. The Digital Twin Service
// resolves the entity by equipment_id (== device_id) against twin_entities.physical_ref.
type TelemetryEvent struct {
	EventType    string         `json:"event_type"`
	EventVersion string         `json:"event_version"`
	TenantID     string         `json:"tenant_id"`
	EquipmentID  string         `json:"equipment_id"`
	Attributes   map[string]any `json:"-"`
}

// DeviceIDFromTopic extracts {device_id} from cos/v1/devices/{device_id}/telemetry.
// Returns an error for any topic that does not match, so a misrouted message is rejected rather
// than silently attributed to the wrong device.
func DeviceIDFromTopic(topic string) (string, error) {
	parts := strings.Split(topic, "/")
	if len(parts) != 5 || parts[0] != "cos" || parts[1] != "v1" || parts[2] != "devices" || parts[4] != "telemetry" {
		return "", fmt.Errorf("unexpected MQTT topic %q — want cos/v1/devices/{device_id}/telemetry", topic)
	}
	if parts[3] == "" {
		return "", fmt.Errorf("empty device_id in topic %q", topic)
	}
	return parts[3], nil
}

// KafkaTopicFor returns the per-tenant Kafka topic for a telemetry event (§7.3 tenant-prefixed).
func KafkaTopicFor(tenantID string) string {
	return fmt.Sprintf("%s.equipment.telemetry.location.v1", tenantID)
}

// Transform turns one MQTT (topic, payload) into a Kafka (topic, value).
//
// The payload is device JSON carrying at least tenant_id; the device_id comes from the topic. The
// output value is the JSON the Digital Twin Service's sync_service expects: equipment_id +
// tenant_id + flat attributes.
func Transform(mqttTopic string, payload []byte) (kafkaTopic string, value []byte, err error) {
	deviceID, err := DeviceIDFromTopic(mqttTopic)
	if err != nil {
		return "", nil, err
	}

	var raw map[string]any
	if err := json.Unmarshal(payload, &raw); err != nil {
		return "", nil, fmt.Errorf("telemetry payload is not JSON: %w", err)
	}

	tenantID, _ := raw["tenant_id"].(string)
	if tenantID == "" {
		return "", nil, fmt.Errorf("telemetry payload for device %s has no tenant_id", deviceID)
	}

	// The Kafka event carries equipment_id (from the topic, authoritative) plus every telemetry
	// attribute the device reported. tenant_id is kept top-level for the consumer's tenant guard.
	out := map[string]any{
		"event_type":    "equipment.telemetry.location.v1",
		"event_version": "1.0",
		"equipment_id":  deviceID,
		"tenant_id":     tenantID,
	}
	for k, v := range raw {
		if k == "tenant_id" {
			continue
		}
		out[k] = v
	}

	value, err = json.Marshal(out)
	if err != nil {
		return "", nil, err
	}
	return KafkaTopicFor(tenantID), value, nil
}
