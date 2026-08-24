// Unit tests for the carbon handler — Phase 24.
//
// Wire-format concerns (Confluent framing, Avro decode, union unwrapping, the §7.3 tenant guard,
// idempotency, retry and DLQ) are tested in the shared coskafka module (libs/go/coskafka) against a golden fixture produced by
// the real TypeScript producer. This file covers only what is carbon-specific.
package carbon

import (
	"encoding/json"
	"testing"
)

func TestResolveScope(t *testing.T) {
	for _, tc := range []struct{ name, in, want string }{
		{"blank defaults to embodied-materials Scope 3", "", "SCOPE_3"},
		{"explicit Scope 3 passes through", "SCOPE_3", "SCOPE_3"},
		{"a future Scope 1 producer is not rewritten", "SCOPE_1", "SCOPE_1"},
		{"a future Scope 2 producer is not rewritten", "SCOPE_2", "SCOPE_2"},
	} {
		if got := resolveScope(tc.in); got != tc.want {
			t.Errorf("%s: resolveScope(%q) = %q, want %q", tc.name, tc.in, got, tc.want)
		}
	}
}

// Decimals stay strings end to end. Parsing them into float64 would make 26.2500 unrepresentable
// exactly and silently alter audited emissions data — carbon.record.created.v1.avsc declares these
// fields `string` for exactly this reason.
func TestCarbonRecordPayload_DecimalsKeepExactText(t *testing.T) {
	raw := `{
		"carbon_record_id":     "33333333-3333-3333-3333-333333333333",
		"project_id":           "44444444-4444-4444-4444-444444444444",
		"consumption_id":       "55555555-5555-5555-5555-555555555555",
		"material_id":          "66666666-6666-6666-6666-666666666666",
		"quantity_consumed":    "10.5000",
		"unit":                 "kg",
		"carbon_factor":        "2.500000",
		"carbon_factor_source": "EPD-2023-001",
		"carbon_kgco2e":        "26.2500",
		"ghg_scope":            "SCOPE_3",
		"recorded_at":          "2026-07-19T00:00:00Z"
	}`

	var payload CarbonRecordPayload
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}

	for _, tc := range []struct{ field, got, want string }{
		{"quantity_consumed", payload.QuantityConsumed, "10.5000"},
		{"carbon_factor", payload.CarbonFactor, "2.500000"},
		{"carbon_kgco2e", payload.CarbonKgco2e, "26.2500"},
		{"carbon_factor_source", payload.CarbonFactorSource, "EPD-2023-001"},
	} {
		if tc.got != tc.want {
			t.Errorf("%s: trailing precision lost — got %q want %q", tc.field, tc.got, tc.want)
		}
	}
}

// A bare event name never matches a real topic — topics carry a tenant prefix (§7.3).
func TestTopicRegex_MatchesTenantScopedTopicsOnly(t *testing.T) {
	if TopicRegex[0] != '^' {
		t.Fatalf("sarama only treats a topic string as a pattern when it starts with ^, got %q", TopicRegex)
	}
	const want = `^[^.]+\.carbon\.record\.created\.v1$`
	if TopicRegex != want {
		t.Errorf("TopicRegex = %q, want %q", TopicRegex, want)
	}
}

// §7.3 consumer group naming: shared tier is {service_name}.shared.
func TestConsumerGroup_FollowsSpecNaming(t *testing.T) {
	const want = "analytics-worker.shared"
	if ConsumerGroup != want {
		t.Errorf("ConsumerGroup = %q, want %q (spec §7.3 shared-tier convention)", ConsumerGroup, want)
	}
}
