package coskafka

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/construction-os/analytics-worker/internal/metrics"
)

// Shared platform topics (§15.7) — platform events are not tenant-scoped.
const (
	PlatformEventsTopic = "platform.events"
	PlatformDLQTopic    = "platform.dlq"
)

// DLQTopicFor derives the dead-letter topic for a failed message.
//
// §7.3: DLQs are tenant-scoped — "DLQ for tenant A cannot receive messages from tenant B" — named
// {tenant_id}.dlq. One per tenant rather than one per tenant-and-domain: the guarantee is about
// tenants, and a DLQ per domain multiplied the per-tenant topic count by ten for a separation the
// spec never asked for. The originating domain stays recoverable from the dlq.original_topic
// header. Platform events share platform.dlq because they were never tenant-scoped to begin with.
// Mirrors dlqTopicFor in @cos/shared/src/kafka/topic-catalog.ts.
func DLQTopicFor(originalTopic string) string {
	if originalTopic == PlatformEventsTopic || strings.HasPrefix(originalTopic, "platform.") {
		return PlatformDLQTopic
	}
	parts := strings.Split(originalTopic, ".")
	if len(parts) < 2 {
		// Not a {tenant_id}.{...} topic. Routing a tenant's payload to a DLQ we cannot attribute
		// would breach §7.3, so refuse to guess a tenant and use the platform DLQ, which is the
		// only topic with no tenant claim attached.
		return PlatformDLQTopic
	}
	return fmt.Sprintf("%s.dlq", parts[0])
}

// DLQPublisher writes messages that could not be processed to their tenant's dead-letter topic.
type DLQPublisher struct {
	client *kgo.Client
}

// NewDLQPublisher builds a publisher on its own produce-only client.
//
// A separate client from the consumer on purpose: a DLQ write must not be blocked by, or share
// failure modes with, the consumer session that produced the failure.
func NewDLQPublisher(brokers []string) (*DLQPublisher, error) {
	client, err := kgo.NewClient(
		kgo.SeedBrokers(brokers...),
		// The DLQ is created on a tenant's first failure — topics are not pre-provisioned
		// (§7.3), and a DLQ that cannot be created loses the very message it exists to preserve.
		kgo.AllowAutoTopicCreation(),
		kgo.RequiredAcks(kgo.AllISRAcks()),
	)
	if err != nil {
		return nil, fmt.Errorf("create dlq client: %w", err)
	}
	return &DLQPublisher{client: client}, nil
}

// Close releases the underlying client.
func (p *DLQPublisher) Close() error {
	p.client.Close()
	return nil
}

// Publish forwards the original, still-encoded value to the DLQ.
//
// The value is written unchanged — decoding may be exactly what failed, and an operator replaying
// from the DLQ needs the original bytes, not this consumer's interpretation of them. Header names
// match the TypeScript DlqPublisher so one tool can read both.
//
// Synchronous by design: a DLQ write that is silently dropped defeats the purpose of having a DLQ,
// so the caller must be able to observe the failure.
func (p *DLQPublisher) Publish(
	ctx context.Context,
	originalTopic string,
	value []byte,
	reason string,
	retryCount int,
) error {
	topic := DLQTopicFor(originalTopic)
	record := &kgo.Record{
		Topic: topic,
		Value: value,
		Headers: []kgo.RecordHeader{
			{Key: "dlq.original_topic", Value: []byte(originalTopic)},
			{Key: "dlq.reason", Value: []byte(reason)},
			{Key: "dlq.failed_at", Value: []byte(time.Now().UTC().Format(time.RFC3339))},
			{Key: "dlq.retry_count", Value: []byte(fmt.Sprintf("%d", retryCount))},
		},
	}

	if err := p.client.ProduceSync(ctx, record).FirstErr(); err != nil {
		return fmt.Errorf("publish to %s: %w", topic, err)
	}
	// Counted only after the synchronous produce succeeds — a failed write is not a produced
	// message. event_type is "dlq": the original event type is unknown here (decoding it may be
	// exactly what failed), and inventing one would put a wrong label on a real counter.
	metrics.MessagesProduced.WithLabelValues(topic, "dlq").Inc()
	return nil
}
