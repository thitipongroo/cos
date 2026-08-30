// Integration tests: the five graph read queries (Phase 13 Graph Queries 1–5).
//
// §35.13 ESC-23: every Query* function in internal/graph/neo4j_writer.go was at 0% — the merge
// brought the read path in and nothing exercised it, which took this module from 86.0% to 23.7%.
//
// These run against the same real Neo4j the ingest tests use. A mocked driver would prove nothing
// here: what these functions are is Cypher, and the only thing worth asserting about Cypher is what
// a real graph returns for it — that the traversal reaches the right nodes, that `tenant_id` in the
// MATCH actually keeps another tenant's subgraph out, and that a missing optional property comes
// back as "" rather than nil.

package integration_test

import (
	"context"
	"testing"

	"github.com/construction-os/kg-ingestion-worker/internal/graph"
	neo4jgo "github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// seed runs one Cypher statement against the test graph.
//
// The fixtures are written directly rather than through MapEvent: these cases are about the READ
// path, and building each shape from the events that happen to produce it would make a query test
// fail whenever a mapper changed.
func seed(t *testing.T, ctx context.Context, driver neo4jgo.DriverWithContext, cypher string) {
	t.Helper()
	session := driver.NewSession(ctx, neo4jgo.SessionConfig{AccessMode: neo4jgo.AccessModeWrite})
	defer session.Close(ctx)
	_, err := session.ExecuteWrite(ctx, func(tx neo4jgo.ManagedTransaction) (any, error) {
		return tx.Run(ctx, cypher, nil)
	})
	require.NoError(t, err)
}

// ── Graph Query 1: vendors supplying a project ───────────────────────────────

func TestQueryVendorsForProject_ReturnsVendorsReachedThroughMaterials(t *testing.T) {
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	seed(t, ctx, driver, `
		CREATE (p:Project {project_id: 'p1', tenant_id: 't1', project_name: 'Riverside Tower'})
		CREATE (m1:Material {material_id: 'm1', tenant_id: 't1', description: 'Cement 42.5N'})
		CREATE (m2:Material {material_id: 'm2', tenant_id: 't1', description: 'Rebar DB12'})
		CREATE (v1:Vendor {vendor_id: 'v1', tenant_id: 't1', vendor_name: 'Siam Cement'})
		CREATE (v2:Vendor {vendor_id: 'v2', tenant_id: 't1', vendor_name: 'Thai Steel'})
		CREATE (p)-[:HAS_MATERIAL]->(m1)-[:SUPPLIED_BY]->(v1)
		CREATE (p)-[:HAS_MATERIAL]->(m2)-[:SUPPLIED_BY]->(v2)
	`)

	rows, err := graph.QueryVendorsForProject(ctx, driver, "p1", "t1")
	require.NoError(t, err)
	require.Len(t, rows, 2)

	got := map[string]string{}
	for _, r := range rows {
		got[r.VendorID] = r.VendorName
	}
	assert.Equal(t, map[string]string{"v1": "Siam Cement", "v2": "Thai Steel"}, got)
}

func TestQueryVendorsForProject_DeduplicatesAVendorSupplyingTwoMaterials(t *testing.T) {
	// DISTINCT is in the query for this reason: a vendor supplying three materials is still one
	// vendor, and a caller rendering the list would otherwise show it three times.
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	seed(t, ctx, driver, `
		CREATE (p:Project {project_id: 'p1', tenant_id: 't1'})
		CREATE (v:Vendor {vendor_id: 'v1', tenant_id: 't1', vendor_name: 'Siam Cement'})
		CREATE (m1:Material {material_id: 'm1', tenant_id: 't1'})
		CREATE (m2:Material {material_id: 'm2', tenant_id: 't1'})
		CREATE (p)-[:HAS_MATERIAL]->(m1)-[:SUPPLIED_BY]->(v)
		CREATE (p)-[:HAS_MATERIAL]->(m2)-[:SUPPLIED_BY]->(v)
	`)

	rows, err := graph.QueryVendorsForProject(ctx, driver, "p1", "t1")
	require.NoError(t, err)
	assert.Len(t, rows, 1)
}

func TestQueryVendorsForProject_NeverCrossesTenants(t *testing.T) {
	// The same project id under two tenants. §30.6 makes a cross-tenant read a Critical Security
	// Defect, and the only thing standing between the two here is `tenant_id` in the MATCH.
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	seed(t, ctx, driver, `
		CREATE (pa:Project {project_id: 'shared-id', tenant_id: 't1'})
		CREATE (ma:Material {material_id: 'ma', tenant_id: 't1'})
		CREATE (va:Vendor {vendor_id: 'mine', tenant_id: 't1', vendor_name: 'Mine'})
		CREATE (pa)-[:HAS_MATERIAL]->(ma)-[:SUPPLIED_BY]->(va)
		CREATE (pb:Project {project_id: 'shared-id', tenant_id: 't2'})
		CREATE (mb:Material {material_id: 'mb', tenant_id: 't2'})
		CREATE (vb:Vendor {vendor_id: 'theirs', tenant_id: 't2', vendor_name: 'Theirs'})
		CREATE (pb)-[:HAS_MATERIAL]->(mb)-[:SUPPLIED_BY]->(vb)
	`)

	rows, err := graph.QueryVendorsForProject(ctx, driver, "shared-id", "t1")
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, "mine", rows[0].VendorID)
}

func TestQueryVendorsForProject_ReturnsNothingForAnUnknownProject(t *testing.T) {
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	rows, err := graph.QueryVendorsForProject(ctx, driver, "no-such-project", "t1")
	require.NoError(t, err)
	assert.Empty(t, rows)
}

// ── Graph Query 2: invoices submitted by a vendor ────────────────────────────

func TestQueryInvoicesForVendor_ReturnsEveryInvoiceWithItsMoneyFields(t *testing.T) {
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	seed(t, ctx, driver, `
		CREATE (v:Vendor {vendor_id: 'v1', tenant_id: 't1'})
		CREATE (i1:Invoice {invoice_id: 'i1', tenant_id: 't1', amount: '150000.0000',
		                    currency: 'THB', status: 'APPROVED'})
		CREATE (i2:Invoice {invoice_id: 'i2', tenant_id: 't1', amount: '75000.0000',
		                    currency: 'THB', status: 'PENDING'})
		CREATE (v)-[:SUBMITTED]->(i1)
		CREATE (v)-[:SUBMITTED]->(i2)
	`)

	rows, err := graph.QueryInvoicesForVendor(ctx, driver, "v1", "t1")
	require.NoError(t, err)
	require.Len(t, rows, 2)

	byID := map[string]graph.InvoiceResult{}
	for _, r := range rows {
		byID[r.InvoiceID] = r
	}
	// Amounts stay strings end to end — they come from DECIMAL columns and must not be routed
	// through a binary float.
	assert.Equal(t, "150000.0000", byID["i1"].Amount)
	assert.Equal(t, "THB", byID["i1"].Currency)
	assert.Equal(t, "APPROVED", byID["i1"].Status)
	assert.Equal(t, "PENDING", byID["i2"].Status)
}

func TestQueryInvoicesForVendor_MissingOptionalPropertiesComeBackEmptyNotNull(t *testing.T) {
	// coalesce(...) in the query and stringVal() in the scan both exist for this: a node written
	// before a property was introduced must not make the caller handle a nil.
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	seed(t, ctx, driver, `
		CREATE (v:Vendor {vendor_id: 'v1', tenant_id: 't1'})
		CREATE (i:Invoice {invoice_id: 'bare', tenant_id: 't1'})
		CREATE (v)-[:SUBMITTED]->(i)
	`)

	rows, err := graph.QueryInvoicesForVendor(ctx, driver, "v1", "t1")
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, "bare", rows[0].InvoiceID)
	assert.Equal(t, "", rows[0].Amount)
	assert.Equal(t, "", rows[0].Currency)
	assert.Equal(t, "", rows[0].Status)
}

func TestQueryInvoicesForVendor_NeverCrossesTenants(t *testing.T) {
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	seed(t, ctx, driver, `
		CREATE (va:Vendor {vendor_id: 'shared-vendor', tenant_id: 't1'})
		CREATE (ia:Invoice {invoice_id: 'mine', tenant_id: 't1'})
		CREATE (va)-[:SUBMITTED]->(ia)
		CREATE (vb:Vendor {vendor_id: 'shared-vendor', tenant_id: 't2'})
		CREATE (ib:Invoice {invoice_id: 'theirs', tenant_id: 't2'})
		CREATE (vb)-[:SUBMITTED]->(ib)
	`)

	rows, err := graph.QueryInvoicesForVendor(ctx, driver, "shared-vendor", "t1")
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, "mine", rows[0].InvoiceID)
}

// ── Graph Query 3: inspections on a project ──────────────────────────────────

func TestQueryInspectionsForProject_ReturnsPassAndFailAlike(t *testing.T) {
	// The query is a pass/fail summary, so it must NOT filter by status — a caller counting failures
	// needs the passes too, or the ratio is meaningless.
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	seed(t, ctx, driver, `
		CREATE (p:Project {project_id: 'p1', tenant_id: 't1'})
		CREATE (i1:Inspection {inspection_id: 'ins1', tenant_id: 't1', status: 'FAILED',
		                       inspected_at: '2026-06-08T09:00:00Z'})
		CREATE (i2:Inspection {inspection_id: 'ins2', tenant_id: 't1', status: 'PASSED',
		                       inspected_at: '2026-06-09T09:00:00Z'})
		CREATE (p)-[:HAS_INSPECTION]->(i1)
		CREATE (p)-[:HAS_INSPECTION]->(i2)
	`)

	rows, err := graph.QueryInspectionsForProject(ctx, driver, "p1", "t1")
	require.NoError(t, err)
	require.Len(t, rows, 2)

	statuses := map[string]string{}
	for _, r := range rows {
		statuses[r.InspectionID] = r.Status
	}
	assert.Equal(t, "FAILED", statuses["ins1"])
	assert.Equal(t, "PASSED", statuses["ins2"])
}

func TestQueryInspectionsForProject_NeverCrossesTenants(t *testing.T) {
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	seed(t, ctx, driver, `
		CREATE (pa:Project {project_id: 'shared-id', tenant_id: 't1'})
		CREATE (ia:Inspection {inspection_id: 'mine', tenant_id: 't1', status: 'PASSED'})
		CREATE (pa)-[:HAS_INSPECTION]->(ia)
		CREATE (pb:Project {project_id: 'shared-id', tenant_id: 't2'})
		CREATE (ib:Inspection {inspection_id: 'theirs', tenant_id: 't2', status: 'FAILED'})
		CREATE (pb)-[:HAS_INSPECTION]->(ib)
	`)

	rows, err := graph.QueryInspectionsForProject(ctx, driver, "shared-id", "t1")
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, "mine", rows[0].InspectionID)
}

// ── Graph Query 4: material supply chain ─────────────────────────────────────

func TestQuerySupplyChain_FollowsBothSuppliedByAndDeliveredBy(t *testing.T) {
	// The traversal is `:SUPPLIED_BY|DELIVERED_BY` on purpose: a material ordered from one vendor
	// and delivered by another has two legitimate links, and a supply-chain view that showed only
	// the purchase side would hide who actually turned up on site.
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	seed(t, ctx, driver, `
		CREATE (p:Project {project_id: 'p1', tenant_id: 't1'})
		CREATE (m:Material {material_id: 'm1', tenant_id: 't1', description: 'Cement 42.5N'})
		CREATE (supplier:Vendor {vendor_id: 'v-supply', tenant_id: 't1', vendor_name: 'Siam Cement'})
		CREATE (carrier:Vendor {vendor_id: 'v-deliver', tenant_id: 't1', vendor_name: 'TH Logistics'})
		CREATE (p)-[:HAS_MATERIAL]->(m)
		CREATE (m)-[:SUPPLIED_BY]->(supplier)
		CREATE (m)-[:DELIVERED_BY]->(carrier)
	`)

	rows, err := graph.QuerySupplyChain(ctx, driver, "p1", "t1")
	require.NoError(t, err)
	require.Len(t, rows, 2)

	vendors := map[string]string{}
	for _, r := range rows {
		vendors[r.VendorID] = r.VendorName
		assert.Equal(t, "m1", r.MaterialID)
		assert.Equal(t, "Cement 42.5N", r.Description)
	}
	assert.Equal(t, map[string]string{"v-supply": "Siam Cement", "v-deliver": "TH Logistics"}, vendors)
}

func TestQuerySupplyChain_NeverCrossesTenants(t *testing.T) {
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	seed(t, ctx, driver, `
		CREATE (pa:Project {project_id: 'shared-id', tenant_id: 't1'})
		CREATE (ma:Material {material_id: 'mine', tenant_id: 't1'})
		CREATE (va:Vendor {vendor_id: 'va', tenant_id: 't1'})
		CREATE (pa)-[:HAS_MATERIAL]->(ma)-[:SUPPLIED_BY]->(va)
		CREATE (pb:Project {project_id: 'shared-id', tenant_id: 't2'})
		CREATE (mb:Material {material_id: 'theirs', tenant_id: 't2'})
		CREATE (vb:Vendor {vendor_id: 'vb', tenant_id: 't2'})
		CREATE (pb)-[:HAS_MATERIAL]->(mb)-[:SUPPLIED_BY]->(vb)
	`)

	rows, err := graph.QuerySupplyChain(ctx, driver, "shared-id", "t1")
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, "mine", rows[0].MaterialID)
}

// ── Graph Query 5: projects sharing a vendor ─────────────────────────────────

func TestQueryProjectsForVendor_TraversesBackFromTheVendor(t *testing.T) {
	// This is the concentration-risk view: which projects would be affected if this vendor failed.
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	seed(t, ctx, driver, `
		CREATE (v:Vendor {vendor_id: 'v1', tenant_id: 't1'})
		CREATE (p1:Project {project_id: 'p1', tenant_id: 't1', project_name: 'Riverside Tower'})
		CREATE (p2:Project {project_id: 'p2', tenant_id: 't1', project_name: 'Logistics Hub'})
		CREATE (m1:Material {material_id: 'm1', tenant_id: 't1'})
		CREATE (m2:Material {material_id: 'm2', tenant_id: 't1'})
		CREATE (p1)-[:HAS_MATERIAL]->(m1)-[:SUPPLIED_BY]->(v)
		CREATE (p2)-[:HAS_MATERIAL]->(m2)-[:DELIVERED_BY]->(v)
	`)

	rows, err := graph.QueryProjectsForVendor(ctx, driver, "v1", "t1")
	require.NoError(t, err)
	require.Len(t, rows, 2)

	names := map[string]string{}
	for _, r := range rows {
		names[r.ProjectID] = r.ProjectName
	}
	assert.Equal(t, map[string]string{"p1": "Riverside Tower", "p2": "Logistics Hub"}, names)
}

func TestQueryProjectsForVendor_DeduplicatesAProjectWithTwoMaterialsFromTheSameVendor(t *testing.T) {
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	seed(t, ctx, driver, `
		CREATE (v:Vendor {vendor_id: 'v1', tenant_id: 't1'})
		CREATE (p:Project {project_id: 'p1', tenant_id: 't1', project_name: 'Riverside Tower'})
		CREATE (m1:Material {material_id: 'm1', tenant_id: 't1'})
		CREATE (m2:Material {material_id: 'm2', tenant_id: 't1'})
		CREATE (p)-[:HAS_MATERIAL]->(m1)-[:SUPPLIED_BY]->(v)
		CREATE (p)-[:HAS_MATERIAL]->(m2)-[:SUPPLIED_BY]->(v)
	`)

	rows, err := graph.QueryProjectsForVendor(ctx, driver, "v1", "t1")
	require.NoError(t, err)
	assert.Len(t, rows, 1)
}

func TestQueryProjectsForVendor_NeverCrossesTenants(t *testing.T) {
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	seed(t, ctx, driver, `
		CREATE (va:Vendor {vendor_id: 'shared-vendor', tenant_id: 't1'})
		CREATE (pa:Project {project_id: 'mine', tenant_id: 't1'})
		CREATE (ma:Material {material_id: 'ma', tenant_id: 't1'})
		CREATE (pa)-[:HAS_MATERIAL]->(ma)-[:SUPPLIED_BY]->(va)
		CREATE (vb:Vendor {vendor_id: 'shared-vendor', tenant_id: 't2'})
		CREATE (pb:Project {project_id: 'theirs', tenant_id: 't2'})
		CREATE (mb:Material {material_id: 'mb', tenant_id: 't2'})
		CREATE (pb)-[:HAS_MATERIAL]->(mb)-[:SUPPLIED_BY]->(vb)
	`)

	rows, err := graph.QueryProjectsForVendor(ctx, driver, "shared-vendor", "t1")
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, "mine", rows[0].ProjectID)
}
