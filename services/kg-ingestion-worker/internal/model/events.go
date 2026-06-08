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
// contract_id = po_id per spec §Phase 13 Node Labels (:Contract).
type POCreatedPayload struct {
	POID      string `json:"po_id"`
	ProjectID string `json:"project_id"`
	VendorID  string `json:"vendor_id"`
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
	InvoiceID  string `json:"invoice_id"`
	POID       string `json:"po_id"`
	ProjectID  string `json:"project_id"`
	VendorID   string `json:"vendor_id"`
	Amount     struct {
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
