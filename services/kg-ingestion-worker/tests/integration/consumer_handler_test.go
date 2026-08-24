// Integration tests: the coskafka handler that bridges a decoded envelope into the graph.
//
// §35.13 ESC-45: newGraphHandler and consumer.Start were both at 0% after the merge.
//
// The handler's contract is mostly about what it does NOT treat as a failure — the worker subscribes
// to a broad topic regex on purpose, so an event it has no mapping for must be ignored rather than
// sent to the DLQ. Getting that backwards fills the DLQ with events nothing was ever going to graph,
// and the retry budget with it. A real Neo4j is used because the success path ends in a write.

package integration_test

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"testing"

	"github.com/construction-os/coslib/coskafka"
	"github.com/construction-os/kg-ingestion-worker/internal/consumer"
	neo4jgo "github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func kafkaEnvelope(eventType, eventID, tenantID string, payload any) *coskafka.EventEnvelope {
	raw, _ := json.Marshal(payload)
	return &coskafka.EventEnvelope{
		EventID:    eventID,
		EventType:  eventType,
		TenantID:   tenantID,
		OccurredAt: "2026-06-08T00:00:00Z",
		Payload:    json.RawMessage(raw),
	}
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
}

func TestGraphHandler_WritesAMappableEventToTheGraph(t *testing.T) {
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	handler := consumer.NewGraphHandler(driver, testLogger())
	err := handler(ctx, kafkaEnvelope("construction.project.created.v1", "e1", "t1", map[string]any{
		"project_id":   "p1",
		"project_name": "Riverside Tower",
	}))
	require.NoError(t, err)

	session := driver.NewSession(ctx, neo4jgo.SessionConfig{AccessMode: neo4jgo.AccessModeRead})
	defer session.Close(ctx)
	rec, err := session.Run(ctx,
		`MATCH (p:Project {project_id: 'p1', tenant_id: 't1'}) RETURN count(p) AS n`, nil)
	require.NoError(t, err)
	require.True(t, rec.Next(ctx))
	n, _ := rec.Record().Get("n")
	assert.Equal(t, int64(1), n)
}

func TestGraphHandler_IgnoresAnEventTypeItHasNoMappingFor(t *testing.T) {
	// Not an error: the worker consumes a broad regex deliberately, so "no graph mapping" is the
	// expected outcome for most of the stream. Returning an error here would DLQ traffic that is
	// working exactly as intended.
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	handler := consumer.NewGraphHandler(driver, testLogger())
	err := handler(ctx, kafkaEnvelope("finance.payment.processed.v1", "e2", "t1", map[string]any{
		"payment_id": "pay-1",
	}))
	assert.NoError(t, err)
}

func TestGraphHandler_SkipsAnUnmappablePayloadWithoutDLQing(t *testing.T) {
	// A payload the mapper cannot read is a producer problem, and one this worker cannot fix by
	// retrying. It is logged and skipped; the DLQ is reserved for writes that could succeed later.
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	handler := consumer.NewGraphHandler(driver, testLogger())
	env := kafkaEnvelope("construction.project.created.v1", "e3", "t1", nil)
	env.Payload = json.RawMessage("{not json")

	assert.NoError(t, handler(ctx, env))
}

func TestGraphHandler_CarriesTheEnvelopeFieldsIntoTheGraph(t *testing.T) {
	// The tenant comes off the envelope, not the payload — the same isolation rule the queries rely
	// on. A node written under the wrong tenant is invisible to its owner and visible to nobody.
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	handler := consumer.NewGraphHandler(driver, testLogger())
	require.NoError(t, handler(ctx, kafkaEnvelope(
		"construction.project.created.v1", "e4", "tenant-from-envelope",
		map[string]any{"project_id": "p9", "project_name": "Envelope Tower"},
	)))

	session := driver.NewSession(ctx, neo4jgo.SessionConfig{AccessMode: neo4jgo.AccessModeRead})
	defer session.Close(ctx)
	rec, err := session.Run(ctx,
		`MATCH (p:Project {project_id: 'p9'}) RETURN p.tenant_id AS tid`, nil)
	require.NoError(t, err)
	require.True(t, rec.Next(ctx))
	tid, _ := rec.Record().Get("tid")
	assert.Equal(t, "tenant-from-envelope", tid)
}

func TestGraphHandler_IsIdempotentOnRedelivery(t *testing.T) {
	// Redelivery is normal — a rebuild replays the whole topic. The operations are MERGEs, so the
	// second pass must not duplicate the node.
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	handler := consumer.NewGraphHandler(driver, testLogger())
	env := kafkaEnvelope("construction.project.created.v1", "e5", "t1", map[string]any{
		"project_id": "p-dup", "project_name": "Once",
	})
	require.NoError(t, handler(ctx, env))
	require.NoError(t, handler(ctx, env))

	session := driver.NewSession(ctx, neo4jgo.SessionConfig{AccessMode: neo4jgo.AccessModeRead})
	defer session.Close(ctx)
	rec, err := session.Run(ctx,
		`MATCH (p:Project {project_id: 'p-dup', tenant_id: 't1'}) RETURN count(p) AS n`, nil)
	require.NoError(t, err)
	require.True(t, rec.Next(ctx))
	n, _ := rec.Record().Get("n")
	assert.Equal(t, int64(1), n)
}

func TestStart_ReturnsTheDLQFailureRatherThanConsumingWithoutOne(t *testing.T) {
	// No brokers at all: the DLQ publisher cannot be built. Start must report that instead of
	// running a consumer with nowhere to put poison messages.
	ctx := context.Background()
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	err := consumer.Start(ctx, consumer.Config{}, driver, false)
	assert.Error(t, err)
}
