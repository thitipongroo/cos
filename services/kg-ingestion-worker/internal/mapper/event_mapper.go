// Maps Kafka event payloads to Neo4j MERGE operations.
// Only events explicitly sourced in spec §Phase 13 are handled.
// Unknown event types are silently skipped (return nil, nil).
package mapper

import (
	"encoding/json"
	"fmt"

	"github.com/construction-os/kg-ingestion-worker/internal/model"
)

// Operation is a single parameterised Cypher statement ready to execute.
type Operation struct {
	Cypher string
	Params map[string]any
}

// MapEvent converts a CloudEvents envelope into a slice of Neo4j Operations.
// Returns (nil, nil) for unhandled event types — caller must not treat this as an error.
func MapEvent(env *model.EventEnvelope) ([]Operation, error) {
	switch env.EventType {
	case "construction.project.created.v1":
		return mapProjectCreated(env)
	case "construction.task.completed.v1":
		return mapTaskCompleted(env)
	case "construction.delay.detected.v1":
		return mapDelayDetected(env)
	case "procurement.po.created.v1":
		return mapPOCreated(env)
	case "procurement.delivery.received.v1":
		return mapDeliveryReceived(env)
	case "procurement.vendor_invoice.approved.v1":
		return mapVendorInvoiceApproved(env)
	case "site.inspection.failed.v1":
		return mapInspectionFailed(env)
	default:
		return nil, nil
	}
}

func mapProjectCreated(env *model.EventEnvelope) ([]Operation, error) {
	var p model.ProjectCreatedPayload
	if err := json.Unmarshal(env.Payload, &p); err != nil {
		return nil, fmt.Errorf("project.created: %w", err)
	}
	return []Operation{
		{
			Cypher: `MERGE (n:Project {project_id: $project_id, tenant_id: $tenant_id})
			         SET n.project_name = $project_name, n.status = 'active',
			             n.budget_amount = $budget_amount`,
			Params: map[string]any{
				"project_id":    p.ProjectID,
				"tenant_id":     env.TenantID,
				"project_name":  p.ProjectName,
				"budget_amount": p.Budget.Amount,
			},
		},
	}, nil
}

func mapTaskCompleted(env *model.EventEnvelope) ([]Operation, error) {
	var p model.TaskCompletedPayload
	if err := json.Unmarshal(env.Payload, &p); err != nil {
		return nil, fmt.Errorf("task.completed: %w", err)
	}
	// task_id in KG = boq_item_id per spec §Phase 13 Node Labels (:Task)
	return []Operation{
		{
			Cypher: `MERGE (n:Task {task_id: $task_id, tenant_id: $tenant_id})
			         SET n.status = 'completed', n.completed_at = $completed_at`,
			Params: map[string]any{
				"task_id":      p.BOQItemID,
				"tenant_id":    env.TenantID,
				"completed_at": p.CompletedAt,
			},
		},
	}, nil
}

func mapDelayDetected(env *model.EventEnvelope) ([]Operation, error) {
	var p model.DelayDetectedPayload
	if err := json.Unmarshal(env.Payload, &p); err != nil {
		return nil, fmt.Errorf("delay.detected: %w", err)
	}
	// delay_id = event_id (CloudEvents envelope) — MERGE key per spec §Phase 13 (:Delay)
	ops := []Operation{
		{
			Cypher: `MERGE (d:Delay {delay_id: $delay_id, tenant_id: $tenant_id})
			         SET d.project_id = $project_id, d.delay_days = $delay_days,
			             d.cause = $cause, d.detected_by = $detected_by,
			             d.severity = $severity, d.occurred_at = $occurred_at`,
			Params: map[string]any{
				"delay_id":    env.EventID,
				"tenant_id":   env.TenantID,
				"project_id":  p.ProjectID,
				"delay_days":  p.DelayDays,
				"cause":       p.Cause,
				"detected_by": p.DetectedBy,
				"severity":    p.Severity,
				"occurred_at": env.OccurredAt,
			},
		},
		{
			// (:Delay)-[:IMPACTS]->(:Project) — spec §Phase 13 Relationships
			Cypher: `MATCH (d:Delay {delay_id: $delay_id, tenant_id: $tenant_id})
			         MATCH (p:Project {project_id: $project_id, tenant_id: $tenant_id})
			         MERGE (d)-[:IMPACTS]->(p)`,
			Params: map[string]any{
				"delay_id":   env.EventID,
				"tenant_id":  env.TenantID,
				"project_id": p.ProjectID,
			},
		},
	}
	if p.TaskID != nil {
		// (:Delay)-[:IMPACTS]->(:Task) — nullable, task-level delay only
		ops = append(ops, Operation{
			Cypher: `MATCH (d:Delay {delay_id: $delay_id, tenant_id: $tenant_id})
			         MATCH (t:Task {task_id: $task_id, tenant_id: $tenant_id})
			         MERGE (d)-[:IMPACTS]->(t)`,
			Params: map[string]any{
				"delay_id":  env.EventID,
				"tenant_id": env.TenantID,
				"task_id":   *p.TaskID,
			},
		})
	}
	return ops, nil
}

func mapPOCreated(env *model.EventEnvelope) ([]Operation, error) {
	var p model.POCreatedPayload
	if err := json.Unmarshal(env.Payload, &p); err != nil {
		return nil, fmt.Errorf("po.created: %w", err)
	}
	// contract_id = po_id per spec §Phase 13 Node Labels (:Contract)
	return []Operation{
		{
			Cypher: `MERGE (n:Vendor {vendor_id: $vendor_id, tenant_id: $tenant_id})`,
			Params: map[string]any{"vendor_id": p.VendorID, "tenant_id": env.TenantID},
		},
		{
			Cypher: `MERGE (n:Contract {contract_id: $contract_id, tenant_id: $tenant_id})`,
			Params: map[string]any{"contract_id": p.POID, "tenant_id": env.TenantID},
		},
	}, nil
}

func mapDeliveryReceived(env *model.EventEnvelope) ([]Operation, error) {
	var p model.DeliveryReceivedPayload
	if err := json.Unmarshal(env.Payload, &p); err != nil {
		return nil, fmt.Errorf("delivery.received: %w", err)
	}
	ops := []Operation{
		{
			Cypher: `MERGE (n:Vendor {vendor_id: $vendor_id, tenant_id: $tenant_id})`,
			Params: map[string]any{"vendor_id": p.VendorID, "tenant_id": env.TenantID},
		},
	}
	for _, item := range p.Items {
		// material_id = item_id = boq_item_id per spec §Phase 13 Node Labels (:Material)
		ops = append(ops,
			Operation{
				Cypher: `MERGE (m:Material {material_id: $material_id, tenant_id: $tenant_id})`,
				Params: map[string]any{"material_id": item.ItemID, "tenant_id": env.TenantID},
			},
			Operation{
				// (:Material)-[:DELIVERED_BY]->(:Vendor) — spec §Phase 13 Relationships (explicit source)
				Cypher: `MATCH (m:Material {material_id: $material_id, tenant_id: $tenant_id})
				         MATCH (v:Vendor {vendor_id: $vendor_id, tenant_id: $tenant_id})
				         MERGE (m)-[:DELIVERED_BY]->(v)`,
				Params: map[string]any{
					"material_id": item.ItemID,
					"vendor_id":   p.VendorID,
					"tenant_id":   env.TenantID,
				},
			},
			Operation{
				// (:Material)-[:SUPPLIED_BY]->(:Vendor) — delivery vendor = supply vendor
				Cypher: `MATCH (m:Material {material_id: $material_id, tenant_id: $tenant_id})
				         MATCH (v:Vendor {vendor_id: $vendor_id, tenant_id: $tenant_id})
				         MERGE (m)-[:SUPPLIED_BY]->(v)`,
				Params: map[string]any{
					"material_id": item.ItemID,
					"vendor_id":   p.VendorID,
					"tenant_id":   env.TenantID,
				},
			},
			Operation{
				// (:Project)-[:HAS_MATERIAL]->(:Material)
				Cypher: `MATCH (p:Project {project_id: $project_id, tenant_id: $tenant_id})
				         MATCH (m:Material {material_id: $material_id, tenant_id: $tenant_id})
				         MERGE (p)-[:HAS_MATERIAL]->(m)`,
				Params: map[string]any{
					"project_id":  p.ProjectID,
					"material_id": item.ItemID,
					"tenant_id":   env.TenantID,
				},
			},
		)
	}
	return ops, nil
}

func mapVendorInvoiceApproved(env *model.EventEnvelope) ([]Operation, error) {
	var p model.VendorInvoiceApprovedPayload
	if err := json.Unmarshal(env.Payload, &p); err != nil {
		return nil, fmt.Errorf("vendor_invoice.approved: %w", err)
	}
	return []Operation{
		{
			Cypher: `MERGE (n:Vendor {vendor_id: $vendor_id, tenant_id: $tenant_id})`,
			Params: map[string]any{"vendor_id": p.VendorID, "tenant_id": env.TenantID},
		},
		{
			Cypher: `MERGE (n:Invoice {invoice_id: $invoice_id, tenant_id: $tenant_id})
			         SET n.amount = $amount, n.currency = $currency, n.status = 'approved'`,
			Params: map[string]any{
				"invoice_id": p.InvoiceID,
				"tenant_id":  env.TenantID,
				"amount":     p.Amount.Amount,
				"currency":   p.Amount.CurrencyCode,
			},
		},
		{
			// (:Vendor)-[:SUBMITTED]->(:Invoice)
			Cypher: `MATCH (v:Vendor {vendor_id: $vendor_id, tenant_id: $tenant_id})
			         MATCH (i:Invoice {invoice_id: $invoice_id, tenant_id: $tenant_id})
			         MERGE (v)-[:SUBMITTED]->(i)`,
			Params: map[string]any{
				"vendor_id":  p.VendorID,
				"invoice_id": p.InvoiceID,
				"tenant_id":  env.TenantID,
			},
		},
		{
			// (:Invoice)-[:BELONGS_TO]->(:Project)
			Cypher: `MATCH (i:Invoice {invoice_id: $invoice_id, tenant_id: $tenant_id})
			         MATCH (p:Project {project_id: $project_id, tenant_id: $tenant_id})
			         MERGE (i)-[:BELONGS_TO]->(p)`,
			Params: map[string]any{
				"invoice_id": p.InvoiceID,
				"project_id": p.ProjectID,
				"tenant_id":  env.TenantID,
			},
		},
	}, nil
}

func mapInspectionFailed(env *model.EventEnvelope) ([]Operation, error) {
	var p model.InspectionFailedPayload
	if err := json.Unmarshal(env.Payload, &p); err != nil {
		return nil, fmt.Errorf("inspection.failed: %w", err)
	}
	return []Operation{
		{
			Cypher: `MERGE (n:Inspection {inspection_id: $inspection_id, tenant_id: $tenant_id})
			         SET n.status = $status, n.inspected_at = $inspected_at`,
			Params: map[string]any{
				"inspection_id": p.InspectionID,
				"tenant_id":     env.TenantID,
				"status":        "failed",
				"inspected_at":  p.InspectedAt,
			},
		},
		{
			// (:Inspection)-[:VALIDATES]->(:Project)
			Cypher: `MATCH (i:Inspection {inspection_id: $inspection_id, tenant_id: $tenant_id})
			         MATCH (p:Project {project_id: $project_id, tenant_id: $tenant_id})
			         MERGE (i)-[:VALIDATES]->(p)`,
			Params: map[string]any{
				"inspection_id": p.InspectionID,
				"project_id":    p.ProjectID,
				"tenant_id":     env.TenantID,
			},
		},
		{
			// (:Project)-[:HAS_INSPECTION]->(:Inspection)
			Cypher: `MATCH (p:Project {project_id: $project_id, tenant_id: $tenant_id})
			         MATCH (i:Inspection {inspection_id: $inspection_id, tenant_id: $tenant_id})
			         MERGE (p)-[:HAS_INSPECTION]->(i)`,
			Params: map[string]any{
				"project_id":    p.ProjectID,
				"inspection_id": p.InspectionID,
				"tenant_id":     env.TenantID,
			},
		},
	}, nil
}
