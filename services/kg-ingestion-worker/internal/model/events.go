// Event envelope and payload structs.
// Source: docs/specifications/32-implementation-specifications.md §32.4
package model

import "encoding/json"

// EventEnvelope is the base CloudEvents-compatible wrapper for all Kafka events.
type EventEnvelope struct {
	EventID       string          `json:"event_id"`
	EventType     string          `json:"event_type"`
	EventVersion  string          `json:"event_version"`
	TenantID      string          `json:"tenant_id"`
	ActorID       string          `json:"actor_id"`
	OccurredAt    string          `json:"occurred_at"`
	CorrelationID string          `json:"correlation_id"`
	Payload       json.RawMessage `json:"payload"`
}

// ProjectCreatedPayload — construction.project.created.v1 (event #1)
type ProjectCreatedPayload struct {
	ProjectID   string `json:"project_id"`
	ProjectName string `json:"project_name"`
	ProjectType string `json:"project_type"`
	Budget      struct {
		Amount       string `json:"amount"`
		CurrencyCode string `json:"currency_code"`
	} `json:"budget"`
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
}

// TaskCompletedPayload — construction.task.completed.v1 (event #7)
// task_id in the KG maps to boq_item_id per spec §Phase 13 Node Labels.
type TaskCompletedPayload struct {
	TaskID          string `json:"task_id"`
	ProjectID       string `json:"project_id"`
	BOQItemID       string `json:"boq_item_id"`
	CompletedAt     string `json:"completed_at"`
	ProgressPercent int    `json:"progress_percent"`
}

// DelayDetectedPayload — construction.delay.detected.v1 (event #8)
type DelayDetectedPayload struct {
	ProjectID  string  `json:"project_id"`
	TaskID     *string `json:"task_id"` // nullable — may be project-level only
	DelayDays  int     `json:"delay_days"`
	Cause      string  `json:"cause"`
	DetectedBy string  `json:"detected_by"`
	Severity   string  `json:"severity"`
}

// POCreatedPayload — procurement.po.created.v1 (event #3)
//
// This event carries NO status, because at creation a purchase order is a DRAFT
// (purchase_orders.status DEFAULT 'DRAFT'). It therefore materialises the vendor only. The
// :Contract node comes from the APPROVED transition instead — see POStatusChangedPayload.
type POCreatedPayload struct {
	POID      string `json:"po_id"`
	ProjectID string `json:"project_id"`
	VendorID  string `json:"vendor_id"`
}

// POStatusChangedPayload — procurement.po.status_changed.v1
//
// The source of the :Contract node. master:4156 defines it as "po_id of APPROVED Purchase Orders
// (APPROVED PO = contractual agreement)", and until 2026-08-29 the mapper created one on
// po.created — i.e. for every PO ever drafted, including ones later rejected or abandoned in DRAFT.
// A node whose whole meaning is "there is a binding agreement with this vendor" was being written
// for documents that bound nobody. Nothing surfaced it because no query reads :Contract yet, which
// is exactly why it could sit wrong for so long.
type POStatusChangedPayload struct {
	POID       string `json:"po_id"`
	FromStatus string `json:"from_status"`
	ToStatus   string `json:"to_status"`
}

// DeliveryReceivedPayload — procurement.delivery.received.v1 (event #11)
// Source for (:Material)-[:DELIVERED_BY]->(:Vendor) per spec §Phase 13 Relationships.
type DeliveryReceivedPayload struct {
	DeliveryID string `json:"delivery_id"`
	POID       string `json:"po_id"`
	ProjectID  string `json:"project_id"`
	VendorID   string `json:"vendor_id"`
	ReceivedAt string `json:"received_at"`
	Items      []struct {
		ItemID string `json:"item_id"`
	} `json:"items_received"`
}

// VendorInvoiceApprovedPayload — procurement.vendor_invoice.approved.v1 (event #13)
type VendorInvoiceApprovedPayload struct {
	InvoiceID string `json:"invoice_id"`
	POID      string `json:"po_id"`
	ProjectID string `json:"project_id"`
	VendorID  string `json:"vendor_id"`
	Amount    struct {
		Amount       string `json:"amount"`
		CurrencyCode string `json:"currency_code"`
	} `json:"amount"`
	ApprovedAt string `json:"approved_at"`
}

// InspectionFailedPayload — site.inspection.failed.v1 (event #6)
type InspectionFailedPayload struct {
	InspectionID string `json:"inspection_id"`
	ProjectID    string `json:"project_id"`
	InspectedAt  string `json:"inspected_at"`
}
