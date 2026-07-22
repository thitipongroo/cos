// Neo4j write operations and the 5 required graph queries.
// All queries include tenant_id in every MATCH/MERGE — enforces tenant isolation.
// Source: context/00_master_construction_os.md §Phase 13 Graph Queries
package graph

import (
	"context"

	"github.com/construction-os/kg-ingestion-worker/internal/mapper"
	neo4j "github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// ExecuteOperations runs a slice of parameterised Cypher statements in a single write transaction.
func ExecuteOperations(ctx context.Context, driver neo4j.DriverWithContext, ops []mapper.Operation) error {
	if len(ops) == 0 {
		return nil
	}
	session := driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		for _, op := range ops {
			if _, err := tx.Run(ctx, op.Cypher, op.Params); err != nil {
				return nil, err
			}
		}
		return nil, nil
	})
	return err
}

// VendorResult is a row returned by the vendors-for-project query.
type VendorResult struct {
	VendorID   string `json:"vendor_id"`
	VendorName string `json:"vendor_name"`
}

// InvoiceResult is a row returned by the invoices-for-vendor query.
type InvoiceResult struct {
	InvoiceID string `json:"invoice_id"`
	Amount    string `json:"amount"`
	Currency  string `json:"currency"`
	Status    string `json:"status"`
}

// InspectionResult is a row returned by the inspections-for-project query.
type InspectionResult struct {
	InspectionID string `json:"inspection_id"`
	Status       string `json:"status"`
	InspectedAt  string `json:"inspected_at"`
}

// SupplyChainResult is a row returned by the supply-chain query.
type SupplyChainResult struct {
	MaterialID  string `json:"material_id"`
	Description string `json:"description"`
	VendorID    string `json:"vendor_id"`
	VendorName  string `json:"vendor_name"`
}

// ProjectResult is a row returned by the vendor-projects query.
type ProjectResult struct {
	ProjectID   string `json:"project_id"`
	ProjectName string `json:"project_name"`
}

// QueryVendorsForProject — Graph Query 1: all vendors supplying to a project.
// Traverse: (:Project)-[:HAS_MATERIAL]->(:Material)-[:SUPPLIED_BY]->(:Vendor)
func QueryVendorsForProject(ctx context.Context, driver neo4j.DriverWithContext, projectID, tenantID string) ([]VendorResult, error) {
	session := driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		records, err := tx.Run(ctx,
			`MATCH (p:Project {project_id: $project_id, tenant_id: $tenant_id})
			 -[:HAS_MATERIAL]->(m:Material)-[:SUPPLIED_BY]->(v:Vendor)
			 RETURN DISTINCT v.vendor_id AS vendor_id, coalesce(v.vendor_name, '') AS vendor_name`,
			map[string]any{"project_id": projectID, "tenant_id": tenantID},
		)
		if err != nil {
			return nil, err
		}
		var rows []VendorResult
		for records.Next(ctx) {
			r := records.Record()
			vid, _ := r.Get("vendor_id")
			vname, _ := r.Get("vendor_name")
			rows = append(rows, VendorResult{
				VendorID:   stringVal(vid),
				VendorName: stringVal(vname),
			})
		}
		return rows, records.Err()
	})
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}
	return result.([]VendorResult), nil
}

// QueryInvoicesForVendor — Graph Query 2: all invoices for a vendor on a project.
// Traverse: (:Vendor)-[:SUBMITTED]->(:Invoice)-[:BELONGS_TO]->(:Project)
func QueryInvoicesForVendor(ctx context.Context, driver neo4j.DriverWithContext, vendorID, tenantID string) ([]InvoiceResult, error) {
	session := driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		records, err := tx.Run(ctx,
			`MATCH (v:Vendor {vendor_id: $vendor_id, tenant_id: $tenant_id})-[:SUBMITTED]->(i:Invoice)
			 RETURN i.invoice_id AS invoice_id,
			        coalesce(i.amount, '') AS amount,
			        coalesce(i.currency, '') AS currency,
			        coalesce(i.status, '') AS status`,
			map[string]any{"vendor_id": vendorID, "tenant_id": tenantID},
		)
		if err != nil {
			return nil, err
		}
		var rows []InvoiceResult
		for records.Next(ctx) {
			r := records.Record()
			iid, _ := r.Get("invoice_id")
			amt, _ := r.Get("amount")
			cur, _ := r.Get("currency")
			st, _ := r.Get("status")
			rows = append(rows, InvoiceResult{
				InvoiceID: stringVal(iid),
				Amount:    stringVal(amt),
				Currency:  stringVal(cur),
				Status:    stringVal(st),
			})
		}
		return rows, records.Err()
	})
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}
	return result.([]InvoiceResult), nil
}

// QueryInspectionsForProject — Graph Query 3: all inspections for a project (pass/fail summary).
func QueryInspectionsForProject(ctx context.Context, driver neo4j.DriverWithContext, projectID, tenantID string) ([]InspectionResult, error) {
	session := driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		records, err := tx.Run(ctx,
			`MATCH (p:Project {project_id: $project_id, tenant_id: $tenant_id})-[:HAS_INSPECTION]->(i:Inspection)
			 RETURN i.inspection_id AS inspection_id,
			        coalesce(i.status, '') AS status,
			        coalesce(i.inspected_at, '') AS inspected_at`,
			map[string]any{"project_id": projectID, "tenant_id": tenantID},
		)
		if err != nil {
			return nil, err
		}
		var rows []InspectionResult
		for records.Next(ctx) {
			r := records.Record()
			iid, _ := r.Get("inspection_id")
			st, _ := r.Get("status")
			at, _ := r.Get("inspected_at")
			rows = append(rows, InspectionResult{
				InspectionID: stringVal(iid),
				Status:       stringVal(st),
				InspectedAt:  stringVal(at),
			})
		}
		return rows, records.Err()
	})
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}
	return result.([]InspectionResult), nil
}

// QuerySupplyChain — Graph Query 4: material supply chain for a project.
// Traverse: (:Project)-[:HAS_MATERIAL]->(:Material)-[:SUPPLIED_BY|DELIVERED_BY]->(:Vendor)
func QuerySupplyChain(ctx context.Context, driver neo4j.DriverWithContext, projectID, tenantID string) ([]SupplyChainResult, error) {
	session := driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		records, err := tx.Run(ctx,
			`MATCH (p:Project {project_id: $project_id, tenant_id: $tenant_id})
			 -[:HAS_MATERIAL]->(m:Material)-[:SUPPLIED_BY|DELIVERED_BY]->(v:Vendor)
			 RETURN m.material_id AS material_id,
			        coalesce(m.description, '') AS description,
			        v.vendor_id AS vendor_id,
			        coalesce(v.vendor_name, '') AS vendor_name`,
			map[string]any{"project_id": projectID, "tenant_id": tenantID},
		)
		if err != nil {
			return nil, err
		}
		var rows []SupplyChainResult
		for records.Next(ctx) {
			r := records.Record()
			mid, _ := r.Get("material_id")
			desc, _ := r.Get("description")
			vid, _ := r.Get("vendor_id")
			vname, _ := r.Get("vendor_name")
			rows = append(rows, SupplyChainResult{
				MaterialID:  stringVal(mid),
				Description: stringVal(desc),
				VendorID:    stringVal(vid),
				VendorName:  stringVal(vname),
			})
		}
		return rows, records.Err()
	})
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}
	return result.([]SupplyChainResult), nil
}

// QueryProjectsForVendor — Graph Query 5: vendor relationship map (which projects share this vendor).
func QueryProjectsForVendor(ctx context.Context, driver neo4j.DriverWithContext, vendorID, tenantID string) ([]ProjectResult, error) {
	session := driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		records, err := tx.Run(ctx,
			`MATCH (v:Vendor {vendor_id: $vendor_id, tenant_id: $tenant_id})
			 <-[:SUPPLIED_BY|DELIVERED_BY]-(m:Material)<-[:HAS_MATERIAL]-(p:Project)
			 RETURN DISTINCT p.project_id AS project_id,
			                 coalesce(p.project_name, '') AS project_name`,
			map[string]any{"vendor_id": vendorID, "tenant_id": tenantID},
		)
		if err != nil {
			return nil, err
		}
		var rows []ProjectResult
		for records.Next(ctx) {
			r := records.Record()
			pid, _ := r.Get("project_id")
			pname, _ := r.Get("project_name")
			rows = append(rows, ProjectResult{
				ProjectID:   stringVal(pid),
				ProjectName: stringVal(pname),
			})
		}
		return rows, records.Err()
	})
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}
	return result.([]ProjectResult), nil
}

func stringVal(v any) string {
	if v == nil {
		return ""
	}
	s, _ := v.(string)
	return s
}
