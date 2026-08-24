package coskafka

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
)

// Proves the pipeline end to end against a real broker, real Schema Registry and real
// producer-encoded bytes: regex subscription → decode → §7.3 tenant guard → handler.
//
// The regex is the point. sarama's ConsumerGroup.Consume takes "a given list of topics" and has no
// pattern support — passing this same regex made the broker reject it as an invalid topic name,
// which is why neither Go consumer could subscribe to a per-tenant topic model at all.
func TestIntegration_ConsumeByRegex(t *testing.T) {
	brokers := os.Getenv("KAFKA_BROKERS")
	if brokers == "" {
		t.Skip("KAFKA_BROKERS not set — skipping broker integration test")
	}
	url := registryURL(t)

	const topicRegex = `^[^.]+\.carbon\.record\.created\.v1$`

	received := make(chan *EventEnvelope, 1)
	consumer := NewConsumer(NewDecoder(url), nil, nil,
		func(_ context.Context, e *EventEnvelope) error {
			select {
			case received <- e:
			default:
			}
			return nil
		}, quietLogger())

	// Unique group per run, reading from the start. A fixed name would commit offsets on the first
	// run and then find nothing to read on every run after it — the test would pass once and fail
	// forever.
	group := fmt.Sprintf("integration-test.%s.%d", t.Name(), time.Now().UnixNano())

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	client, err := kgo.NewClient(
		kgo.SeedBrokers(brokers),
		kgo.ConsumerGroup(group),
		kgo.ConsumeTopics(topicRegex),
		kgo.ConsumeRegex(),
		kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
	)
	if err != nil {
		t.Fatalf("franz-go rejected the regex subscription: %v", err)
	}
	defer client.Close()

	go func() {
		for {
			fetches := client.PollFetches(ctx)
			if ctx.Err() != nil {
				return
			}
			fetches.EachRecord(func(r *kgo.Record) { consumer.Handle(ctx, r) })
		}
	}()

	select {
	case envelope := <-received:
		// The regex matches every tenant's carbon topic, so any tenant's message is a valid result —
		// asserting a specific tenant_id would make the test depend on which topics happen to exist.
		// What matters is that a regex-matched, Confluent-framed message decoded and passed the guard.
		if envelope.EventType != "carbon.record.created.v1" {
			t.Errorf("event_type = %q", envelope.EventType)
		}
		if envelope.TenantID == "" {
			t.Error("tenant_id is empty — envelope did not decode")
		}
		if len(envelope.Payload) == 0 {
			t.Error("payload is empty")
		}
	case <-ctx.Done():
		t.Fatal("no message consumed within 45s via regex subscription — " +
			"the producer→broker→regex-match→decoder path is broken")
	}
}

// Pins the capability the migration exists for: a regex topic is accepted and resolved, not sent to
// the broker verbatim. If this ever fails the way sarama did, the per-tenant topic model is
// unsubscribable again.
func TestRegexSubscriptionIsAccepted(t *testing.T) {
	brokers := os.Getenv("KAFKA_BROKERS")
	if brokers == "" {
		t.Skip("KAFKA_BROKERS not set — skipping broker integration test")
	}

	client, err := kgo.NewClient(
		kgo.SeedBrokers(brokers),
		kgo.ConsumerGroup(fmt.Sprintf("integration-test.%s.%d", t.Name(), time.Now().UnixNano())),
		kgo.ConsumeTopics(`^[^.]+\.carbon\.record\.created\.v1$`),
		kgo.ConsumeRegex(),
	)
	if err != nil {
		t.Fatalf("client creation failed: %v", err)
	}
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// A regex that resolves produces fetches with no topic-level error. sarama's failure mode was
	// an INVALID_TOPIC_EXCEPTION from the broker on the pattern string itself.
	fetches := client.PollFetches(ctx)
	fetches.EachError(func(topic string, _ int32, err error) {
		if ctx.Err() == nil {
			t.Errorf("fetch error on regex-resolved topic %q: %v", topic, err)
		}
	})
}
