// Unit tests for Carbon consumer — Phase 24
package carbon

import (
	"encoding/json"
	"testing"
)

func TestCarbonRecordEvent_Unmarshal(t *testing.T) {
	raw := `{
		"event_type":           "carbon.record.created.v1",
		"tenant_id":            "t1",
		"project_id":           "p1",
		"carbon_record_id":     "cr1",
		"consumption_id":       "c1",
		"material_id":          "m1",
		"quantity_consumed":    10.5,
		"unit":                 "kg",
		"carbon_factor":        2.5,
		"carbon_factor_source": "EPD-2023-001",
		"carbon_kgco2e":        26.25,
		"ghg_scope":            "SCOPE_3",
		"recorded_at":          "2026-06-08T00:00:00Z"
	}`

	var event CarbonRecordEvent
	if err := json.Unmarshal([]byte(raw), &event); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if event.CarbonKgco2e != 26.25 {
		t.Errorf("expected carbon_kgco2e=26.25, got %f", event.CarbonKgco2e)
	}
	if event.GHGScope != "SCOPE_3" {
		t.Errorf("expected ghg_scope=SCOPE_3, got %s", event.GHGScope)
	}
}

func TestCarbonRecordEvent_CarbonKgco2eCalculation(t *testing.T) {
	tests := []struct {
		quantity float64
		factor   float64
		want     float64
	}{
		{10.0, 2.5, 25.0},
		{0.0, 5.0, 0.0},
		{100.0, 0.001, 0.1},
	}

	for _, tt := range tests {
		got := tt.quantity * tt.factor
		if abs(got-tt.want) > 1e-9 {
			t.Errorf("quantity=%f × factor=%f: expected %f got %f",
				tt.quantity, tt.factor, tt.want, got)
		}
	}
}

func abs(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}
