// IoT telemetry → Kafka transform (spec §33.3 write path).
//
// The IoT Ingestion Worker bridges the MQTT broker (EMQX) to Kafka: it subscribes to
// cos/v1/tenants/{tenant_id}/devices/{device_id}/telemetry, and for each message produces a Kafka
// event the Digital Twin Service consumes. This file is the pure transform — MQTT topic + payload
// in, Kafka topic + event out — so it is unit-testable without a broker or Kafka.
//
// TENANT AUTHORITY: both tenant_id and device_id come from the MQTT *topic*, never the payload. The
// broker (EMQX) authenticates each device with a per-device X.509 client certificate and enforces a
// default-deny topic ACL that binds the connected client to its own tenant/device topic namespace
// (cf. AWS IoT Core ${iot:Connection.Thing.ThingName} policy variables) — so a device physically
// cannot publish under another tenant's topic prefix. A tenant_id in the payload is therefore
// untrusted: if present it MUST equal the authenticated topic tenant, otherwise the message is a
// spoofing attempt and is rejected. (Previously tenant_id was read from the payload, which let any
// device attribute telemetry to an arbitrary tenant.)
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

// ParseTelemetryTopic extracts {tenant_id} and {device_id} from
// cos/v1/tenants/{tenant_id}/devices/{device_id}/telemetry. Both segments are broker-authenticated
// (the EMQX ACL binds the device's X.509 identity to this topic namespace). Returns an error for any
// topic that does not match, so a misrouted message is rejected rather than silently mis-attributed.
func ParseTelemetryTopic(topic string) (tenantID, deviceID string, err error) {
	parts := strings.Split(topic, "/")
	if len(parts) != 7 ||
		parts[0] != "cos" || parts[1] != "v1" ||
		parts[2] != "tenants" || parts[4] != "devices" || parts[6] != "telemetry" {
		return "", "", fmt.Errorf(
			"unexpected MQTT topic %q — want cos/v1/tenants/{tenant_id}/devices/{device_id}/telemetry",
			topic,
		)
	}
	if parts[3] == "" {
		return "", "", fmt.Errorf("empty tenant_id in topic %q", topic)
	}
	if parts[5] == "" {
		return "", "", fmt.Errorf("empty device_id in topic %q", topic)
	}
	return parts[3], parts[5], nil
}

// KafkaTopicFor returns the per-tenant Kafka topic for a telemetry event (§7.3 tenant-prefixed).
func KafkaTopicFor(tenantID string) string {
	return fmt.Sprintf("%s.equipment.telemetry.location.v1", tenantID)
}

// Transform turns one MQTT (topic, payload) into a Kafka (topic, value).
//
// tenant_id and device_id both come from the broker-authenticated topic. The payload is device JSON
// carrying telemetry attributes; any tenant_id it contains is untrusted and only permitted if it
// matches the topic. The output value is the JSON the Digital Twin Service's sync_service expects:
// equipment_id + tenant_id + flat attributes.
func Transform(mqttTopic string, payload []byte) (kafkaTopic string, value []byte, err error) {
	tenantID, deviceID, err := ParseTelemetryTopic(mqttTopic)
	if err != nil {
		return "", nil, err
	}

	var raw map[string]any
	if err := json.Unmarshal(payload, &raw); err != nil {
		return "", nil, fmt.Errorf("telemetry payload is not JSON: %w", err)
	}

	// tenant_id is authoritative from the topic. Reject a payload that claims a different tenant —
	// that is a device attempting to attribute telemetry to a tenant it is not authenticated for.
	if claimed, ok := raw["tenant_id"].(string); ok && claimed != "" && claimed != tenantID {
		return "", nil, fmt.Errorf(
			"payload tenant_id %q does not match authenticated topic tenant %q (device %s)",
			claimed, tenantID, deviceID,
		)
	}

	// The Kafka event carries equipment_id + tenant_id (both from the topic, authoritative) plus
	// every telemetry attribute the device reported. tenant_id is kept top-level for the consumer's
	// tenant guard.
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
