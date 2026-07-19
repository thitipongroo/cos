package coskafka

import (
	"encoding/json"
	"net/http"
	"os"
	"testing"
	"time"
)

// The decisive test: real producer bytes, real Schema Registry, real decode into the struct the
// consumer uses. Everything else in this package is unit-level; this is the one that proves the
// producer/consumer contract actually holds.
//
// Skipped when no registry is reachable so `go test ./...` stays green on a bare checkout — the
// fixture-only tests in decoder_test.go still run and still catch a re-broken wire format.
func registryURL(t *testing.T) string {
	t.Helper()
	url := os.Getenv("SCHEMA_REGISTRY_URL")
	if url == "" {
		url = "http://localhost:8081"
	}
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(url + "/subjects")
	if err != nil {
		t.Skipf("no Schema Registry at %s (%v) — skipping live decode test", url, err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Skipf("Schema Registry at %s returned %d — skipping live decode test", url, resp.StatusCode)
	}
	return url
}

type carbonPayload struct {
	CarbonRecordID     string `json:"carbon_record_id"`
	ProjectID          string `json:"project_id"`
	ConsumptionID      string `json:"consumption_id"`
	MaterialID         string `json:"material_id"`
	QuantityConsumed   string `json:"quantity_consumed"`
	Unit               string `json:"unit"`
	CarbonFactor       string `json:"carbon_factor"`
	CarbonFactorSource string `json:"carbon_factor_source"`
	CarbonKgco2e       string `json:"carbon_kgco2e"`
	GHGScope           string `json:"ghg_scope"`
	RecordedAt         string `json:"recorded_at"`
}

func TestDecode_GoldenBytesThroughRealRegistry(t *testing.T) {
	url := registryURL(t)
	decoder := NewDecoder(url)

	var envelope EventEnvelope
	if err := decoder.Decode(goldenBytes(t), &envelope); err != nil {
		t.Fatalf("Decode failed on real producer bytes: %v", err)
	}

	if envelope.EventType != "carbon.record.created.v1" {
		t.Errorf("event_type = %q", envelope.EventType)
	}
	if envelope.TenantID != "11111111-1111-1111-1111-111111111111" {
		t.Errorf("tenant_id = %q", envelope.TenantID)
	}
	// The union path: producer sent null, so these must be nil — not a *string pointing at the
	// literal text "null", and not a decode error.
	if envelope.TraceID != nil {
		t.Errorf("trace_id = %v, want nil for an Avro null union", *envelope.TraceID)
	}
	if envelope.SpanID != nil {
		t.Errorf("span_id = %v, want nil for an Avro null union", *envelope.SpanID)
	}

	var payload carbonPayload
	if err := json.Unmarshal(envelope.Payload, &payload); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}

	// Decimals must survive as exact text. If the schema ever reverts to double, 26.2500 comes back
	// as 26.25 (or worse) and this assertion is what catches it.
	for _, tc := range []struct{ field, got, want string }{
		{"quantity_consumed", payload.QuantityConsumed, "10.5000"},
		{"carbon_factor", payload.CarbonFactor, "2.500000"},
		{"carbon_kgco2e", payload.CarbonKgco2e, "26.2500"},
		{"carbon_factor_source", payload.CarbonFactorSource, "EPD-2023-001"},
		{"ghg_scope", payload.GHGScope, "SCOPE_3"},
		{"unit", payload.Unit, "kg"},
	} {
		if tc.got != tc.want {
			t.Errorf("%s = %q, want %q", tc.field, tc.got, tc.want)
		}
	}
}

func TestDecode_RejectsRawJSON(t *testing.T) {
	decoder := NewDecoder("http://localhost:8081") // not contacted — framing check fails first

	err := decoder.Decode([]byte(`{"event_type":"carbon.record.created.v1"}`), &EventEnvelope{})
	if err == nil {
		t.Fatal("want an error for unframed JSON")
	}
}
