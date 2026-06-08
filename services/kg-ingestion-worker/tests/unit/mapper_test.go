// Unit tests: Kafka event payload → Cypher operation transformation.
// No Neo4j connection required — tests the mapper in isolation.
// Source: context/00_master_construction_os.md §Phase 13 Generate item 7
package unit_test

import (
	"encoding/json"
	"testing"

	"github.com/construction-os/kg-ingestion-worker/internal/mapper"
	"github.com/construction-os/kg-ingestion-worker/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func envelope(eventType, eventID, tenantID string, payload any) *model.EventEnvelope {
	raw, _ := json.Marshal(payload)
	return &model.EventEnvelope{
		EventID:    eventID,
		EventType:  eventType,
		TenantID:   tenantID,
		OccurredAt: "2026-06-08T00:00:00Z",
		Payload:    json.RawMessage(raw),
	}
}

// ── construction.project.created.v1 ──────────────────────────────────────────

func TestMapProjectCreated_ProducesOneMergeOp(t *testing.T) {
	env := envelope("construction.project.created.v1", "ev-1", "t-abc", map[string]any{
		"project_id":   "proj-001",
		"project_name": "Tower A",
		"project_type": "COMMERCIAL",
		"budget":       map[string]any{"amount": "5000000", "currency_code": "THB"},
		"start_date":   "2026-01-01",
		"end_date":     "2027-06-01",
	})

	ops, err := mapper.MapEvent(env)
	require.NoError(t, err)
	require.Len(t, ops, 1)
	assert.Contains(t, ops[0].Cypher, "MERGE")
	assert.Contains(t, ops[0].Cypher, ":Project")
	assert.Equal(t, "proj-001", ops[0].Params["project_id"])
	assert.Equal(t, "t-abc", ops[0].Params["tenant_id"])
}

// ── construction.task.completed.v1 ───────────────────────────────────────────

func TestMapTaskCompleted_UsesBoqItemIDAsTaskID(t *testing.T) {
	env := envelope("construction.task.completed.v1", "ev-2", "t-abc", map[string]any{
		"task_id":          "task-old",
		"project_id":       "proj-001",
		"boq_item_id":      "boq-999",
		"completed_at":     "2026-06-01T10:00:00Z",
		"progress_percent": 100,
	})

	ops, err := mapper.MapEvent(env)
	require.NoError(t, err)
	require.Len(t, ops, 1)
	// task_id in KG = boq_item_id per spec §Phase 13 Node Labels (:Task)
	assert.Equal(t, "boq-999", ops[0].Params["task_id"])
	assert.Contains(t, ops[0].Cypher, ":Task")
}

// ── construction.delay.detected.v1 ───────────────────────────────────────────

func TestMapDelayDetected_ProjectLevelOnly_TwoOps(t *testing.T) {
	env := envelope("construction.delay.detected.v1", "ev-delay-1", "t-abc", map[string]any{
		"project_id":  "proj-001",
		"task_id":     nil,
		"delay_days":  7,
		"cause":       "WEATHER",
		"detected_by": "AI_FORECAST",
		"severity":    "HIGH",
	})

	ops, err := mapper.MapEvent(env)
	require.NoError(t, err)
	// MERGE (:Delay) + MERGE (:Delay)-[:IMPACTS]->(:Project) — no task op when task_id nil
	assert.Len(t, ops, 2)
	assert.Contains(t, ops[0].Cypher, ":Delay")
	// delay_id = event_id from envelope (MERGE key per spec)
	assert.Equal(t, "ev-delay-1", ops[0].Params["delay_id"])
	assert.Equal(t, "t-abc", ops[0].Params["tenant_id"])
}

func TestMapDelayDetected_TaskLevel_ThreeOps(t *testing.T) {
	taskID := "boq-999"
	env := envelope("construction.delay.detected.v1", "ev-delay-2", "t-abc", map[string]any{
		"project_id":  "proj-001",
		"task_id":     taskID,
		"delay_days":  3,
		"cause":       "PROCUREMENT",
		"detected_by": "MANUAL_REPORT",
		"severity":    "MEDIUM",
	})

	ops, err := mapper.MapEvent(env)
	require.NoError(t, err)
	// MERGE (:Delay) + IMPACTS->Project + IMPACTS->Task
	assert.Len(t, ops, 3)
	assert.Contains(t, ops[2].Cypher, ":Task")
	assert.Equal(t, taskID, ops[2].Params["task_id"])
}

func TestMapDelayDetected_DelayIDIsEventID(t *testing.T) {
	env := envelope("construction.delay.detected.v1", "unique-event-uuid", "t-abc", map[string]any{
		"project_id": "proj-001", "delay_days": 1, "cause": "EQUIPMENT",
		"detected_by": "MANUAL_REPORT", "severity": "LOW",
	})

	ops, err := mapper.MapEvent(env)
	require.NoError(t, err)
	require.NotEmpty(t, ops)
	assert.Equal(t, "unique-event-uuid", ops[0].Params["delay_id"])
}

// ── procurement.po.created.v1 ─────────────────────────────────────────────────

func TestMapPOCreated_ContractIDIsPoID(t *testing.T) {
	env := envelope("procurement.po.created.v1", "ev-3", "t-abc", map[string]any{
		"po_id":      "po-555",
		"project_id": "proj-001",
		"vendor_id":  "vendor-77",
	})

	ops, err := mapper.MapEvent(env)
	require.NoError(t, err)
	require.Len(t, ops, 2)
	// first op: Vendor; second op: Contract with contract_id = po_id
	contractOp := ops[1]
	assert.Contains(t, contractOp.Cypher, ":Contract")
	assert.Equal(t, "po-555", contractOp.Params["contract_id"])
}

// ── procurement.delivery.received.v1 ─────────────────────────────────────────

func TestMapDeliveryReceived_CreatesDeliveredByRelationships(t *testing.T) {
	env := envelope("procurement.delivery.received.v1", "ev-4", "t-abc", map[string]any{
		"delivery_id": "del-1",
		"po_id":       "po-555",
		"project_id":  "proj-001",
		"vendor_id":   "vendor-77",
		"received_at": "2026-06-05T09:00:00Z",
		"items_received": []map[string]any{
			{"item_id": "boq-111", "quantity_received": "10.0"},
			{"item_id": "boq-222", "quantity_received": "5.0"},
		},
	})

	ops, err := mapper.MapEvent(env)
	require.NoError(t, err)
	// 1 Vendor MERGE + per item: Material + DELIVERED_BY + SUPPLIED_BY + HAS_MATERIAL = 4 ops per item
	assert.Len(t, ops, 1+2*4)

	cyphers := make([]string, len(ops))
	for i, op := range ops {
		cyphers[i] = op.Cypher
	}
	assert.Contains(t, cyphers[1], ":Material")

	deliveredByFound := false
	for _, op := range ops {
		if contains(op.Cypher, "DELIVERED_BY") {
			deliveredByFound = true
		}
	}
	assert.True(t, deliveredByFound, "expected DELIVERED_BY relationship")
}

func TestMapDeliveryReceived_TenantIsolationInAllOps(t *testing.T) {
	env := envelope("procurement.delivery.received.v1", "ev-5", "tenant-xyz", map[string]any{
		"delivery_id": "del-2", "po_id": "po-1", "project_id": "p-1",
		"vendor_id": "v-1", "received_at": "2026-06-01T00:00:00Z",
		"items_received": []map[string]any{{"item_id": "m-1", "quantity_received": "1"}},
	})

	ops, err := mapper.MapEvent(env)
	require.NoError(t, err)
	for _, op := range ops {
		assert.Equal(t, "tenant-xyz", op.Params["tenant_id"],
			"every op must carry tenant_id; op: %s", op.Cypher)
	}
}

// ── procurement.vendor_invoice.approved.v1 ────────────────────────────────────

func TestMapVendorInvoiceApproved_FourOps(t *testing.T) {
	env := envelope("procurement.vendor_invoice.approved.v1", "ev-6", "t-abc", map[string]any{
		"invoice_id": "inv-99",
		"po_id":      "po-555",
		"project_id": "proj-001",
		"vendor_id":  "vendor-77",
		"amount":     map[string]any{"amount": "250000", "currency_code": "THB"},
		"approved_at": "2026-06-07T12:00:00Z",
	})

	ops, err := mapper.MapEvent(env)
	require.NoError(t, err)
	// Vendor + Invoice + SUBMITTED + BELONGS_TO
	assert.Len(t, ops, 4)
}

// ── site.inspection.failed.v1 ────────────────────────────────────────────────

func TestMapInspectionFailed_ThreeOps(t *testing.T) {
	env := envelope("site.inspection.failed.v1", "ev-7", "t-abc", map[string]any{
		"inspection_id": "insp-42",
		"project_id":    "proj-001",
		"inspected_at":  "2026-06-06T08:00:00Z",
	})

	ops, err := mapper.MapEvent(env)
	require.NoError(t, err)
	// Inspection MERGE + VALIDATES + HAS_INSPECTION
	assert.Len(t, ops, 3)
	assert.Contains(t, ops[0].Cypher, ":Inspection")
	assert.Equal(t, "failed", ops[0].Params["status"])
}

// ── unknown event type ────────────────────────────────────────────────────────

func TestMapEvent_UnknownType_ReturnsNilNoError(t *testing.T) {
	env := envelope("workforce.checkin.created.v1", "ev-8", "t-abc", map[string]any{})
	ops, err := mapper.MapEvent(env)
	assert.NoError(t, err)
	assert.Nil(t, ops)
}

// ── malformed payload ─────────────────────────────────────────────────────────

func TestMapEvent_MalformedPayload_ReturnsError(t *testing.T) {
	env := &model.EventEnvelope{
		EventType: "construction.project.created.v1",
		TenantID:  "t-abc",
		Payload:   json.RawMessage(`not-valid-json`),
	}
	_, err := mapper.MapEvent(env)
	assert.Error(t, err)
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		func() bool {
			for i := 0; i <= len(s)-len(substr); i++ {
				if s[i:i+len(substr)] == substr {
					return true
				}
			}
			return false
		}())
}
