// Integration tests: full ingest pipeline using a real Neo4j testcontainer.
// Source: context/00_master_construction_os.md §Phase 13 Generate item 8
package integration_test

import (
	"context"
	"encoding/json"
	"os"
	"sync"
	"testing"

	"github.com/construction-os/kg-ingestion-worker/internal/graph"
	"github.com/construction-os/kg-ingestion-worker/internal/mapper"
	"github.com/construction-os/kg-ingestion-worker/internal/model"
	neo4jgo "github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go/modules/neo4j"
)

// One Neo4j for the whole package.
//
// Each test used to start its own container. That was fine at five tests and stopped being fine at
// twenty-five: the package hit Go's 10-minute default timeout and the run FAILED after 600s, which
// reads in CI as a broken suite rather than a slow one. Container startup dominates — the queries
// themselves take milliseconds.
//
// Isolation is preserved by wiping the graph between tests rather than by rebuilding the server.
// Every case seeds exactly what it asserts on, so a clean graph is the same starting point a fresh
// container gave, at a fraction of the cost.
var (
	sharedDriver neo4jgo.DriverWithContext
	sharedOnce   sync.Once
	sharedStop   func()
)

func TestMain(m *testing.M) {
	code := m.Run()
	if sharedStop != nil {
		sharedStop()
	}
	os.Exit(code)
}

func setupNeo4j(t *testing.T) (neo4jgo.DriverWithContext, func()) {
	t.Helper()
	ctx := context.Background()

	sharedOnce.Do(func() {
		container, err := neo4j.Run(ctx, "neo4j:5", neo4j.WithoutAuthentication())
		if err != nil {
			panic("failed to start Neo4j testcontainer: " + err.Error())
		}
		boltURI, err := container.BoltUrl(ctx)
		if err != nil {
			panic("bolt url: " + err.Error())
		}
		driver, err := neo4jgo.NewDriverWithContext(boltURI, neo4jgo.NoAuth())
		if err != nil {
			panic("neo4j driver: " + err.Error())
		}
		if err := graph.ApplyConstraints(ctx, driver); err != nil {
			panic("apply constraints: " + err.Error())
		}
		sharedDriver = driver
		sharedStop = func() {
			_ = driver.Close(ctx)
			_ = container.Terminate(ctx)
		}
	})

	wipe := func() {
		session := sharedDriver.NewSession(ctx, neo4jgo.SessionConfig{AccessMode: neo4jgo.AccessModeWrite})
		defer session.Close(ctx)
		_, err := session.ExecuteWrite(ctx, func(tx neo4jgo.ManagedTransaction) (any, error) {
			return tx.Run(ctx, "MATCH (n) DETACH DELETE n", nil)
		})
		require.NoError(t, err)
	}
	wipe() // start from a clean graph regardless of what ran before

	return sharedDriver, wipe
}

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

func runEvent(t *testing.T, ctx context.Context, driver neo4jgo.DriverWithContext, env *model.EventEnvelope) {
	t.Helper()
	ops, err := mapper.MapEvent(env)
	require.NoError(t, err)
	require.NoError(t, graph.ExecuteOperations(ctx, driver, ops))
}

// ── Project node ──────────────────────────────────────────────────────────────

func TestIngest_ProjectCreated_NodeExists(t *testing.T) {
	driver, cleanup := setupNeo4j(t)
	defer cleanup()
	ctx := context.Background()

	runEvent(t, ctx, driver, envelope("construction.project.created.v1", "ev-1", "t-1", map[string]any{
		"project_id": "proj-001", "project_name": "Tower A", "project_type": "COMMERCIAL",
		"budget":     map[string]any{"amount": "1000000", "currency_code": "THB"},
		"start_date": "2026-01-01", "end_date": "2027-01-01",
	}))

	session := driver.NewSession(ctx, neo4jgo.SessionConfig{AccessMode: neo4jgo.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4jgo.ManagedTransaction) (any, error) {
		r, err := tx.Run(ctx,
			`MATCH (p:Project {project_id: $pid, tenant_id: $tid}) RETURN p.project_name AS name`,
			map[string]any{"pid": "proj-001", "tid": "t-1"},
		)
		if err != nil {
			return nil, err
		}
		if r.Next(ctx) {
			v, _ := r.Record().Get("name")
			return v, nil
		}
		return nil, nil
	})
	require.NoError(t, err)
	assert.Equal(t, "Tower A", result)
}

// ── Delay node + IMPACTS relationships ────────────────────────────────────────

func TestIngest_DelayDetected_NodeAndRelationshipExist(t *testing.T) {
	driver, cleanup := setupNeo4j(t)
	defer cleanup()
	ctx := context.Background()

	// Seed project first so MATCH in IMPACTS op succeeds
	runEvent(t, ctx, driver, envelope("construction.project.created.v1", "ev-p", "t-1", map[string]any{
		"project_id": "proj-001", "project_name": "Tower A", "project_type": "COMMERCIAL",
		"budget":     map[string]any{"amount": "1000000", "currency_code": "THB"},
		"start_date": "2026-01-01", "end_date": "2027-01-01",
	}))

	runEvent(t, ctx, driver, envelope("construction.delay.detected.v1", "ev-delay-1", "t-1", map[string]any{
		"project_id": "proj-001", "task_id": nil,
		"delay_days": 7, "cause": "WEATHER", "detected_by": "AI_FORECAST", "severity": "HIGH",
	}))

	session := driver.NewSession(ctx, neo4jgo.SessionConfig{AccessMode: neo4jgo.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4jgo.ManagedTransaction) (any, error) {
		r, err := tx.Run(ctx,
			`MATCH (d:Delay {delay_id: $did, tenant_id: $tid})-[:IMPACTS]->(p:Project)
			 RETURN d.delay_days AS days`,
			map[string]any{"did": "ev-delay-1", "tid": "t-1"},
		)
		if err != nil {
			return nil, err
		}
		if r.Next(ctx) {
			v, _ := r.Record().Get("days")
			return v, nil
		}
		return nil, nil
	})
	require.NoError(t, err)
	assert.EqualValues(t, 7, result)
}

// ── DELIVERED_BY relationship ─────────────────────────────────────────────────

func TestIngest_DeliveryReceived_DeliveredByRelationshipExists(t *testing.T) {
	driver, cleanup := setupNeo4j(t)
	defer cleanup()
	ctx := context.Background()

	runEvent(t, ctx, driver, envelope("construction.project.created.v1", "ev-p2", "t-1", map[string]any{
		"project_id": "proj-002", "project_name": "Bridge B", "project_type": "INFRASTRUCTURE",
		"budget":     map[string]any{"amount": "5000000", "currency_code": "THB"},
		"start_date": "2026-02-01", "end_date": "2027-02-01",
	}))

	runEvent(t, ctx, driver, envelope("procurement.delivery.received.v1", "ev-del", "t-1", map[string]any{
		"delivery_id": "del-1", "po_id": "po-1", "project_id": "proj-002",
		"vendor_id": "vendor-A", "received_at": "2026-06-01T00:00:00Z",
		"items_received": []map[string]any{{"item_id": "mat-001", "quantity_received": "100"}},
	}))

	session := driver.NewSession(ctx, neo4jgo.SessionConfig{AccessMode: neo4jgo.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4jgo.ManagedTransaction) (any, error) {
		r, err := tx.Run(ctx,
			`MATCH (m:Material {material_id: $mid, tenant_id: $tid})-[:DELIVERED_BY]->(v:Vendor)
			 RETURN v.vendor_id AS vid`,
			map[string]any{"mid": "mat-001", "tid": "t-1"},
		)
		if err != nil {
			return nil, err
		}
		if r.Next(ctx) {
			v, _ := r.Record().Get("vid")
			return v, nil
		}
		return nil, nil
	})
	require.NoError(t, err)
	assert.Equal(t, "vendor-A", result)
}

// ── tenant isolation ──────────────────────────────────────────────────────────

func TestIngest_TenantIsolation_NodesNotSharedAcrossTenants(t *testing.T) {
	driver, cleanup := setupNeo4j(t)
	defer cleanup()
	ctx := context.Background()

	// Create project for tenant t-1
	runEvent(t, ctx, driver, envelope("construction.project.created.v1", "ev-t1", "t-1", map[string]any{
		"project_id": "proj-shared-id", "project_name": "Tenant1 Project", "project_type": "COMMERCIAL",
		"budget":     map[string]any{"amount": "1000", "currency_code": "THB"},
		"start_date": "2026-01-01", "end_date": "2026-12-31",
	}))

	// Create project with same project_id for tenant t-2
	runEvent(t, ctx, driver, envelope("construction.project.created.v1", "ev-t2", "t-2", map[string]any{
		"project_id": "proj-shared-id", "project_name": "Tenant2 Project", "project_type": "RESIDENTIAL",
		"budget":     map[string]any{"amount": "2000", "currency_code": "THB"},
		"start_date": "2026-01-01", "end_date": "2026-12-31",
	}))

	session := driver.NewSession(ctx, neo4jgo.SessionConfig{AccessMode: neo4jgo.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4jgo.ManagedTransaction) (any, error) {
		// t-2 query must NOT return t-1's project
		r, err := tx.Run(ctx,
			`MATCH (p:Project {project_id: 'proj-shared-id', tenant_id: 't-2'})
			 RETURN p.project_name AS name`,
			nil,
		)
		if err != nil {
			return nil, err
		}
		if r.Next(ctx) {
			v, _ := r.Record().Get("name")
			return v, nil
		}
		return nil, nil
	})
	require.NoError(t, err)
	assert.Equal(t, "Tenant2 Project", result, "t-2 query should return only t-2 node")
}

// ── Neo4j schema constraints ──────────────────────────────────────────────────

func TestIngest_Constraints_IdempotentOnDuplicateMerge(t *testing.T) {
	driver, cleanup := setupNeo4j(t)
	defer cleanup()
	ctx := context.Background()

	ev := envelope("construction.project.created.v1", "ev-dup", "t-1", map[string]any{
		"project_id": "proj-dup", "project_name": "First Name", "project_type": "COMMERCIAL",
		"budget":     map[string]any{"amount": "1000", "currency_code": "THB"},
		"start_date": "2026-01-01", "end_date": "2026-12-31",
	})
	runEvent(t, ctx, driver, ev)

	// Second event with same project_id — MERGE must update, not create duplicate
	ev2 := envelope("construction.project.created.v1", "ev-dup2", "t-1", map[string]any{
		"project_id": "proj-dup", "project_name": "Updated Name", "project_type": "COMMERCIAL",
		"budget":     map[string]any{"amount": "9999", "currency_code": "THB"},
		"start_date": "2026-01-01", "end_date": "2026-12-31",
	})
	runEvent(t, ctx, driver, ev2)

	session := driver.NewSession(ctx, neo4jgo.SessionConfig{AccessMode: neo4jgo.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4jgo.ManagedTransaction) (any, error) {
		r, err := tx.Run(ctx,
			`MATCH (p:Project {project_id: 'proj-dup', tenant_id: 't-1'}) RETURN count(p) AS cnt`,
			nil,
		)
		if err != nil {
			return nil, err
		}
		if r.Next(ctx) {
			v, _ := r.Record().Get("cnt")
			return v, nil
		}
		return int64(0), nil
	})
	require.NoError(t, err)
	assert.EqualValues(t, 1, result, "MERGE must not create duplicate nodes")
}
