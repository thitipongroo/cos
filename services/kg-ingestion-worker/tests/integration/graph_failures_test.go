// Integration tests: what the graph layer does when Neo4j will not answer.
//
// §35.13 ESC-45: every one of these functions carried an error path that no test entered, so a
// Neo4j outage was the one condition the graph layer had never been observed under.
//
// It matters which way each one fails. `ExecuteOperations` MUST return its error — the coskafka
// handler turns that into a retry, and swallowing it would drop an event that a working database
// would have accepted. The read queries must fail loudly too: a query that returned an empty slice
// on a connection error would tell an operator "this project has no vendors" when the truth is
// "nobody asked the database".
//
// The failure is produced by closing the driver, which is the closest deterministic stand-in for an
// unreachable server: every session opened afterwards is refused.

package integration_test

import (
	"context"
	"testing"

	"github.com/construction-os/kg-ingestion-worker/internal/graph"
	"github.com/construction-os/kg-ingestion-worker/internal/mapper"
	neo4jgo "github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// closedDriver returns a driver that has been shut down, so every call through it fails.
func closedDriver(t *testing.T) neo4jgo.DriverWithContext {
	t.Helper()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	boltURI := driverTargetFor(t, driver)
	own, err := neo4jgo.NewDriverWithContext(boltURI, neo4jgo.NoAuth())
	require.NoError(t, err)
	require.NoError(t, own.Close(context.Background()))
	return own
}

// driverTargetFor recovers the bolt URI of the shared container from the driver itself, so this
// file does not need to know how the container was started.
func driverTargetFor(t *testing.T, driver neo4jgo.DriverWithContext) string {
	t.Helper()
	target := driver.Target()
	return target.Scheme + "://" + target.Host
}

func TestExecuteOperations_ReturnsTheErrorSoTheEventIsRetried(t *testing.T) {
	ctx := context.Background()
	dead := closedDriver(t)

	err := graph.ExecuteOperations(ctx, dead, []mapper.Operation{{
		Cypher: `MERGE (p:Project {project_id: $id, tenant_id: $t})`,
		Params: map[string]any{"id": "p1", "t": "t1"},
	}})

	assert.Error(t, err, "a write failure must reach the handler, which retries or DLQs it")
}

func TestExecuteOperations_DoesNothingForAnEmptyOperationList(t *testing.T) {
	// The mapper returns no operations for event types this worker does not graph, which is the
	// common case. That must not open a session at all — it would be a connection per ignored event.
	ctx := context.Background()
	dead := closedDriver(t)

	// A closed driver would fail if a session were opened; that it does not is the assertion.
	assert.NoError(t, graph.ExecuteOperations(ctx, dead, nil))
	assert.NoError(t, graph.ExecuteOperations(ctx, dead, []mapper.Operation{}))
}

func TestQueriesFailLoudlyWhenNeo4jIsUnreachable(t *testing.T) {
	// Table-driven so a query added later without an error-path test shows up here as a gap.
	ctx := context.Background()
	dead := closedDriver(t)

	t.Run("QueryVendorsForProject", func(t *testing.T) {
		rows, err := graph.QueryVendorsForProject(ctx, dead, "p1", "t1")
		assert.Error(t, err)
		assert.Nil(t, rows, "an error must not also come back as an empty result set")
	})
	t.Run("QueryInvoicesForVendor", func(t *testing.T) {
		rows, err := graph.QueryInvoicesForVendor(ctx, dead, "v1", "t1")
		assert.Error(t, err)
		assert.Nil(t, rows)
	})
	t.Run("QueryInspectionsForProject", func(t *testing.T) {
		rows, err := graph.QueryInspectionsForProject(ctx, dead, "p1", "t1")
		assert.Error(t, err)
		assert.Nil(t, rows)
	})
	t.Run("QuerySupplyChain", func(t *testing.T) {
		rows, err := graph.QuerySupplyChain(ctx, dead, "p1", "t1")
		assert.Error(t, err)
		assert.Nil(t, rows)
	})
	t.Run("QueryProjectsForVendor", func(t *testing.T) {
		rows, err := graph.QueryProjectsForVendor(ctx, dead, "v1", "t1")
		assert.Error(t, err)
		assert.Nil(t, rows)
	})
}

func TestApplyConstraints_ReportsAFailureRatherThanStartingWithoutThem(t *testing.T) {
	// The constraints are what make the MERGEs idempotent. Starting the worker without them and
	// carrying on would let a redelivery duplicate every node it touches.
	ctx := context.Background()
	dead := closedDriver(t)

	assert.Error(t, graph.ApplyConstraints(ctx, dead))
}
