// Neo4j schema constraints — uniqueness on {label}.{id} + tenant_id for all 8 node types.
// Source: context/00_master_construction_os.md §Phase 13 Generate item 5
package graph

import (
	"context"

	neo4j "github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// ApplyConstraints creates composite UNIQUENESS constraints on (id, tenant_id) for all 8
// Phase 13 node labels. Uniqueness (not NODE KEY) is used because NODE KEY requires Neo4j
// Enterprise; composite uniqueness is supported on Community and enforces the same key
// uniqueness (without the additional property-existence guarantee).
// Safe to call on every startup — IF NOT EXISTS prevents duplicate constraint errors.
func ApplyConstraints(ctx context.Context, driver neo4j.DriverWithContext) error {
	constraints := []string{
		`CREATE CONSTRAINT kg_project_key IF NOT EXISTS
		 FOR (n:Project) REQUIRE (n.project_id, n.tenant_id) IS UNIQUE`,

		`CREATE CONSTRAINT kg_task_key IF NOT EXISTS
		 FOR (n:Task) REQUIRE (n.task_id, n.tenant_id) IS UNIQUE`,

		`CREATE CONSTRAINT kg_material_key IF NOT EXISTS
		 FOR (n:Material) REQUIRE (n.material_id, n.tenant_id) IS UNIQUE`,

		`CREATE CONSTRAINT kg_vendor_key IF NOT EXISTS
		 FOR (n:Vendor) REQUIRE (n.vendor_id, n.tenant_id) IS UNIQUE`,

		`CREATE CONSTRAINT kg_inspection_key IF NOT EXISTS
		 FOR (n:Inspection) REQUIRE (n.inspection_id, n.tenant_id) IS UNIQUE`,

		`CREATE CONSTRAINT kg_invoice_key IF NOT EXISTS
		 FOR (n:Invoice) REQUIRE (n.invoice_id, n.tenant_id) IS UNIQUE`,

		`CREATE CONSTRAINT kg_contract_key IF NOT EXISTS
		 FOR (n:Contract) REQUIRE (n.contract_id, n.tenant_id) IS UNIQUE`,

		`CREATE CONSTRAINT kg_delay_key IF NOT EXISTS
		 FOR (n:Delay) REQUIRE (n.delay_id, n.tenant_id) IS UNIQUE`,
	}

	session := driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		for _, cypher := range constraints {
			if _, err := tx.Run(ctx, cypher, nil); err != nil {
				return nil, err
			}
		}
		return nil, nil
	})
	return err
}
