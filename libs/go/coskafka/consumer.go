package coskafka

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
)

// Retry policy — identical to MAX_RETRIES / RETRY_DELAYS_MS in @cos/shared/src/kafka/consumer.ts.
// Kept in step deliberately: an operator reasoning about redelivery should not have to ask which
// language a consumer happens to be written in.
var retryDelays = []time.Duration{1 * time.Second, 5 * time.Second, 30 * time.Second}

const maxRetries = 3

// Handler processes one decoded event. Returning an error triggers the retry/DLQ path.
type Handler func(ctx context.Context, envelope *EventEnvelope) error

// dlqSink is the DLQ dependency the pipeline needs — an interface so a fake can be injected in
// tests. *DLQPublisher satisfies it.
type dlqSink interface {
	Publish(ctx context.Context, originalTopic string, value []byte, reason string, retryCount int) error
}

// Consumer applies the same message pipeline the TypeScript consumer does: decode, tenant guard,
// idempotency claim, handler with bounded retry, then DLQ.
type Consumer struct {
	decoder     *Decoder
	dlq         dlqSink
	idempotency *Idempotency
	handler     Handler
	logger      *slog.Logger
}

// NewConsumer wires the pipeline. dlq and idempotency may be nil, which degrades that stage only —
// see Handle for exactly what is lost. The decoder and handler are required.
func NewConsumer(
	decoder *Decoder,
	dlq dlqSink,
	idempotency *Idempotency,
	handler Handler,
	logger *slog.Logger,
) *Consumer {
	return &Consumer{decoder: decoder, dlq: dlq, idempotency: idempotency, handler: handler, logger: logger}
}

// Run consumes a regex-matched set of topics until ctx is cancelled.
//
// Uses franz-go rather than sarama for one reason: sarama's ConsumerGroup.Consume takes "a given
// list of topics" and has no pattern support, so a per-tenant topic model (§7.3) cannot be
// subscribed to at all — passing a regex made the broker reject it as an invalid topic name.
// kgo.ConsumeRegex() reinterprets the topics as patterns and works in group mode.
//
// Topic discovery is bounded by MetadataMaxAge (franz-go default 5m, left at the default): a new
// tenant's first event waits up to that long before the group notices its topic. Nothing is lost —
// the record sits in the topic until the consumer sees it. Lowering it speeds up pickup at the cost
// of more frequent metadata loads, and franz-go's own docs warn that "when consuming via regex,
// every metadata request loads *all* topics".
func (c *Consumer) Run(ctx context.Context, brokers []string, group string, topicRegex string) error {
	client, err := kgo.NewClient(
		kgo.SeedBrokers(brokers...),
		kgo.ConsumerGroup(group),
		kgo.ConsumeTopics(topicRegex),
		kgo.ConsumeRegex(),
		// Start at the beginning for a group with no committed offsets. AtEnd would silently drop
		// every event produced before the metadata loop first discovers a tenant's topic — up to
		// MetadataMaxAge (5m) of a new tenant's earliest events. AtStart instead backfills the
		// history these consumers never read (they could not subscribe at all until this change),
		// and re-reading is safe: downstream writes are idempotent by construction (a unique index
		// / ReplacingMergeTree for carbon analytics, idempotent MERGEs for the knowledge graph).
		// ConsumeResetOffset applies only to a group with no committed offset, so a caller wanting a
		// full replay of already-committed history must pass a fresh group name.
		kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
	)
	if err != nil {
		return fmt.Errorf("create consumer client: %w", err)
	}
	defer client.Close()

	c.logger.Info("consumer started", "group", group, "topic_regex", topicRegex)

	for {
		fetches := client.PollFetches(ctx)
		if ctx.Err() != nil {
			return nil
		}
		// Fetch-level errors are per topic/partition and mostly transient (rebalance, leader
		// change). Log and keep polling — returning here would tear down the whole consumer for a
		// condition franz-go recovers from on its own.
		fetches.EachError(func(topic string, partition int32, err error) {
			c.logger.Error("fetch error", "error", err, "topic", topic, "partition", partition)
		})

		fetches.EachRecord(func(record *kgo.Record) {
			c.Handle(ctx, record)
		})
	}
}

// Handle runs one record through the pipeline. It never returns an error: every failure mode ends
// in either the DLQ or a log line, because a Kafka consumer that stops on a bad message blocks its
// whole partition.
//
// Offsets are committed by franz-go's autocommit regardless of outcome. Every terminal state above
// is already recorded — processed, skipped as duplicate, or parked in the DLQ — so withholding the
// commit would only replay a message whose fate is already decided and stall the partition behind it.
func (c *Consumer) Handle(ctx context.Context, record *kgo.Record) {
	var envelope EventEnvelope
	if err := c.decoder.Decode(record.Value, &envelope); err != nil {
		c.logger.Error("avro decode failed — sending to DLQ",
			"error", err, "topic", record.Topic, "offset", record.Offset)
		c.toDLQ(ctx, record, "AVRO_DECODE_ERROR")
		return
	}

	// §7.3 tenant isolation guard: "tenant_id is also enforced in message headers as a secondary
	// validation guard; consumer validates header before processing". A mismatch means the message
	// was misrouted or tampered with — never process it.
	headerTenant := headerValue(record.Headers, "tenant_id")
	if headerTenant == "" || headerTenant != envelope.TenantID {
		c.logger.Error("tenant_id header missing or does not match envelope — sending to DLQ",
			"topic", record.Topic, "header_tenant_id", headerTenant, "event_tenant_id", envelope.TenantID)
		c.toDLQ(ctx, record, "TENANT_ID_MISMATCH")
		return
	}

	if c.idempotency != nil {
		claimed, err := c.idempotency.Claim(ctx, envelope.EventID)
		if err != nil {
			// Redis is unreachable. Processing anyway risks a duplicate; skipping risks losing the
			// event entirely. At-least-once is the weaker failure, and the handlers downstream are
			// expected to be idempotent (the carbon insert is guarded by a unique index).
			c.logger.Warn("idempotency check failed — processing anyway (at-least-once)",
				"error", err, "event_id", envelope.EventID)
		} else if !claimed {
			c.logger.Debug("duplicate event skipped",
				"event_id", envelope.EventID, "event_type", envelope.EventType)
			return
		}
	}

	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		if lastErr = c.handler(ctx, &envelope); lastErr == nil {
			return
		}
		c.logger.Warn("handler failed",
			"error", lastErr, "event_id", envelope.EventID, "event_type", envelope.EventType,
			"attempt", attempt+1, "max", maxRetries)

		if attempt == maxRetries-1 {
			break
		}
		select {
		case <-time.After(retryDelays[attempt]):
		case <-ctx.Done():
			// Shutting down mid-retry. The message is not DLQ'd, so it will be redelivered to
			// whoever picks up this partition next.
			c.logger.Warn("shutdown during retry backoff — leaving event for redelivery",
				"event_id", envelope.EventID)
			return
		}
	}

	c.logger.Error("max retries exceeded — sending to DLQ",
		"error", lastErr, "event_id", envelope.EventID, "event_type", envelope.EventType)
	c.toDLQ(ctx, record, fmt.Sprintf("HANDLER_ERROR: %v", lastErr))

	// Drop the claim so an operator replaying from the DLQ is not silently deduped away.
	if c.idempotency != nil {
		if err := c.idempotency.Release(ctx, envelope.EventID); err != nil {
			c.logger.Warn("failed to release idempotency claim — a DLQ replay of this event will be skipped as a duplicate",
				"error", err, "event_id", envelope.EventID)
		}
	}
}

func (c *Consumer) toDLQ(ctx context.Context, record *kgo.Record, reason string) {
	if c.dlq == nil {
		c.logger.Error("no DLQ publisher configured — message is being dropped",
			"topic", record.Topic, "offset", record.Offset, "reason", reason)
		return
	}
	if err := c.dlq.Publish(ctx, record.Topic, record.Value, reason, maxRetries); err != nil {
		c.logger.Error("DLQ publish failed — message is lost",
			"error", err, "topic", record.Topic, "offset", record.Offset, "reason", reason)
	}
}

// headerValue reads a Kafka header by key, returning "" when absent.
func headerValue(headers []kgo.RecordHeader, key string) string {
	for _, h := range headers {
		if h.Key == key {
			return string(h.Value)
		}
	}
	return ""
}

// ErrNoHandler is returned by handlers that receive an event type they do not serve.
var ErrNoHandler = errors.New("no handler registered for event type")
