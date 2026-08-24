// Kafka consumer for kg-ingestion-worker.
//
// Subscribes by regex to every tenant's construction/procurement/site/finance topics (§7.3, §Phase
// 13) and drives the shared coskafka pipeline: Confluent-framed Avro decode → tenant-isolation
// guard → idempotency → retry → DLQ. The kg-specific handler bridges the decoded envelope into the
// Neo4j mapper and graph writer.
//
// Replaces the previous sarama implementation, which could not work on two counts verified against a
// real broker: it json.Unmarshal'd Avro-encoded bytes (fails on byte 0 of every message), and
// sarama has no regex topic subscription (the pattern was sent to the broker as a literal topic name
// and rejected as invalid). Both are fixed by franz-go + coskafka.
package consumer

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/construction-os/coslib/coskafka"
	"github.com/construction-os/kg-ingestion-worker/internal/graph"
	"github.com/construction-os/kg-ingestion-worker/internal/mapper"
	"github.com/construction-os/kg-ingestion-worker/internal/model"
	neo4j "github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// TopicRegex matches all tenant-scoped topics for the four consumed domains.
// Format: {tenant_id}.{domain}.{entity}.{action}.{version}
// Source: docs/specifications/07-multi-tenant-architecture §7.3 + §Phase 13 NE-1/NE-4 fixes.
const TopicRegex = `^[^.]+\.(construction|procurement|site|finance)\..*`

// ConsumerGroupID is the Kafka consumer group name. §7.3 shared-tier convention {service_name}.shared.
const ConsumerGroupID = "kg-ingestion-worker.shared"

// Config carries the endpoints the consumer needs.
type Config struct {
	Brokers     []string
	RegistryURL string
	RedisURL    string
}

// Start runs the kg consumer until ctx is cancelled.
//
// resetOffset drives the admin rebuild endpoint: true replays the whole history to rebuild the
// graph from scratch, false starts at the beginning for a fresh group (these consumers never
// committed before this change, so there is history to backfill and re-reading is safe — the graph
// writer's operations are idempotent MERGEs).
func Start(ctx context.Context, cfg Config, driver neo4j.DriverWithContext, resetOffset bool) error {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("component", "kg-consumer")

	// A full rebuild must replay history the stable group has already committed. ConsumeResetOffset
	// only takes effect for a group with no committed offset, so a rebuild runs under a distinct,
	// throwaway group whose fresh AtStart replays everything. The stable group is used for normal
	// consumption.
	group := ConsumerGroupID
	if resetOffset {
		group = fmt.Sprintf("%s.rebuild.%d", ConsumerGroupID, time.Now().UnixNano())
		logger.Info("full rebuild — consuming under a throwaway group from the start", "group", group)
	}

	dlq, err := coskafka.NewDLQPublisher(cfg.Brokers)
	if err != nil {
		return err
	}
	defer func() { _ = dlq.Close() }()

	var idem *coskafka.Idempotency
	if cfg.RedisURL != "" {
		idem, err = coskafka.NewIdempotency(cfg.RedisURL)
		if err != nil {
			logger.Warn("redis unavailable — running without idempotency", "error", err)
		} else {
			defer func() { _ = idem.Close() }()
		}
	}

	handler := NewGraphHandler(driver, logger)
	consumer := coskafka.NewConsumer(
		coskafka.NewDecoder(cfg.RegistryURL),
		dlq,
		idem,
		handler,
		logger,
	)

	return consumer.Run(ctx, cfg.Brokers, group, TopicRegex)
}

// NewGraphHandler bridges a decoded envelope into the Neo4j mapper + writer.
//
// Returning nil for unmappable or unhandled events (rather than an error) keeps them out of the DLQ:
// the kg worker deliberately consumes a broad regex and ignores event types it has no graph mapping
// for — that is not a failure. A genuine write error IS returned, so the coskafka retry/DLQ path
// handles a Neo4j outage.
func NewGraphHandler(driver neo4j.DriverWithContext, logger *slog.Logger) coskafka.Handler {
	return func(ctx context.Context, envelope *coskafka.EventEnvelope) error {
		env := model.EventEnvelope{
			EventID:       envelope.EventID,
			EventType:     envelope.EventType,
			EventVersion:  envelope.EventVersion,
			TenantID:      envelope.TenantID,
			ActorID:       envelope.ActorID,
			OccurredAt:    envelope.OccurredAt,
			CorrelationID: envelope.CorrelationID,
			Payload:       json.RawMessage(envelope.Payload),
		}

		ops, err := mapper.MapEvent(&env)
		if err != nil {
			logger.Warn("mapper error — skipping", "error", err, "event_type", env.EventType)
			return nil
		}
		if len(ops) == 0 {
			return nil // event type this worker does not graph — not an error
		}

		return graph.ExecuteOperations(ctx, driver, ops)
	}
}
