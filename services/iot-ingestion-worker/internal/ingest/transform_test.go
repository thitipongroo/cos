package ingest

import (
	"encoding/json"
	"testing"
)

func TestDeviceIDFromTopic(t *testing.T) {
	id, err := DeviceIDFromTopic("cos/v1/devices/EXCAVATOR-07/telemetry")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id != "EXCAVATOR-07" {
		t.Errorf("device id = %q, want EXCAVATOR-07", id)
	}

	for _, bad := range []string{
		"cos/v1/devices//telemetry",    // empty device id
		"cos/v1/devices/x/state",       // wrong suffix
		"other/v1/devices/x/telemetry", // wrong prefix
		"cos/v1/devices/x",             // too short
	} {
		if _, err := DeviceIDFromTopic(bad); err == nil {
			t.Errorf("expected error for topic %q", bad)
		}
	}
}

func TestKafkaTopicIsTenantPrefixed(t *testing.T) {
	got := KafkaTopicFor("tenant-a")
	if got != "tenant-a.equipment.telemetry.location.v1" {
		t.Errorf("kafka topic = %q", got)
	}
}

func TestTransform_BuildsEventFromTopicAndPayload(t *testing.T) {
	payload := []byte(`{"tenant_id":"11111111-1111-1111-1111-111111111111","fuel_level":62,"lat":13.75,"status":"MOVING"}`)

	topic, value, err := Transform("cos/v1/devices/EXCAVATOR-07/telemetry", payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if topic != "11111111-1111-1111-1111-111111111111.equipment.telemetry.location.v1" {
		t.Errorf("kafka topic = %q", topic)
	}

	var out map[string]any
	if err := json.Unmarshal(value, &out); err != nil {
		t.Fatalf("output not JSON: %v", err)
	}
	// equipment_id comes from the topic, not the payload — authoritative.
	if out["equipment_id"] != "EXCAVATOR-07" {
		t.Errorf("equipment_id = %v", out["equipment_id"])
	}
	if out["tenant_id"] != "11111111-1111-1111-1111-111111111111" {
		t.Errorf("tenant_id = %v", out["tenant_id"])
	}
	if out["fuel_level"].(float64) != 62 {
		t.Errorf("fuel_level not carried through: %v", out["fuel_level"])
	}
	if out["event_type"] != "equipment.telemetry.location.v1" {
		t.Errorf("event_type = %v", out["event_type"])
	}
}

func TestTransform_Errors(t *testing.T) {
	// No tenant_id → rejected (cannot route to a tenant topic).
	if _, _, err := Transform("cos/v1/devices/x/telemetry", []byte(`{"fuel_level":1}`)); err == nil {
		t.Error("expected error for payload with no tenant_id")
	}
	// Non-JSON payload → rejected.
	if _, _, err := Transform("cos/v1/devices/x/telemetry", []byte(`not json`)); err == nil {
		t.Error("expected error for non-JSON payload")
	}
	// Bad topic → rejected before parsing payload.
	if _, _, err := Transform("bad/topic", []byte(`{"tenant_id":"t"}`)); err == nil {
		t.Error("expected error for bad topic")
	}
}
