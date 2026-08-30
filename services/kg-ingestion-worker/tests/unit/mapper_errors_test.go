// Unit tests: what the mapper does with a payload it cannot read.
//
// §35.13 ESC-45: every mapper carried an unmarshal guard that no test entered, so each sat at
// 75–86% and the module's total suffered for it.
//
// This is not box-ticking. The handler in internal/consumer treats a mapper error as "skip and
// log", NOT as a DLQ-worthy failure — a producer sending a payload this worker cannot parse is not
// something a retry fixes. That decision only holds if the mapper actually RETURNS an error for
// such a payload instead of panicking or silently emitting operations with zero values in them,
// which would write nodes keyed on "" into the graph.

package unit_test

import (
	"encoding/json"
	"testing"

	"github.com/construction-os/kg-ingestion-worker/internal/mapper"
	"github.com/construction-os/kg-ingestion-worker/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// everyMappedEventType is the switch in MapEvent, listed here so a new case added without a
// malformed-payload test shows up as a gap rather than passing unnoticed.
var everyMappedEventType = []string{
	"construction.project.created.v1",
	"construction.task.completed.v1",
	"construction.delay.detected.v1",
	"procurement.po.created.v1",
	"procurement.delivery.received.v1",
	"procurement.vendor_invoice.approved.v1",
	"site.inspection.failed.v1",
}

func malformed(eventType string) *model.EventEnvelope {
	return &model.EventEnvelope{
		EventID:    "ev-bad",
		EventType:  eventType,
		TenantID:   "t-abc",
		OccurredAt: "2026-06-08T00:00:00Z",
		Payload:    json.RawMessage(`{"project_id": `), // truncated mid-value
	}
}

func TestMapEvent_ReturnsAnErrorForAnUnreadablePayload(t *testing.T) {
	for _, eventType := range everyMappedEventType {
		t.Run(eventType, func(t *testing.T) {
			ops, err := mapper.MapEvent(malformed(eventType))

			require.Error(t, err, "an unreadable payload must be reported, not mapped")
			assert.Nil(t, ops, "no operations may be emitted from a payload that failed to parse")
			// The message names the event type, which is what makes the skip log actionable —
			// the operator needs to know which producer is sending what.
			assert.Contains(t, err.Error(), eventTypeStem(eventType))
		})
	}
}

// eventTypeStem is the part of the event type the mapper puts in its error message
// ("construction.project.created.v1" → "project.created").
func eventTypeStem(eventType string) string {
	switch eventType {
	case "construction.project.created.v1":
		return "project.created"
	case "construction.task.completed.v1":
		return "task.completed"
	case "construction.delay.detected.v1":
		return "delay.detected"
	case "procurement.po.created.v1":
		return "po.created"
	case "procurement.delivery.received.v1":
		return "delivery.received"
	case "procurement.vendor_invoice.approved.v1":
		return "vendor_invoice.approved"
	case "site.inspection.failed.v1":
		return "inspection.failed"
	}
	t := eventType
	return t
}

func TestMapEvent_ReturnsNoOperationsForAnEventTypeItDoesNotGraph(t *testing.T) {
	// The worker subscribes to a broad topic regex on purpose. An unmapped type is the common case,
	// not an error — see the handler's comment in internal/consumer.
	ops, err := mapper.MapEvent(envelope("finance.payment.processed.v1", "ev-x", "t-abc",
		map[string]any{"payment_id": "pay-1"}))

	require.NoError(t, err)
	assert.Empty(t, ops)
}
