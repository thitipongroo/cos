package topics

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
)

// KadmCreator.CreateTopic is the one path that cannot be exercised without a broker: it issues a
// real CreateTopics RPC. Follows the same convention as the analytics-worker / kg-ingestion-worker
// broker tests — skipped unless KAFKA_BROKERS is set.
//
// Proves the two properties main.go depends on:
//  1. the topic really is created (the producer runs with auto-creation OFF, so nothing else will)
//  2. creating it twice is not an error (two workers can race on a tenant's first message)
func TestIntegration_KadmCreatorCreatesTopicIdempotently(t *testing.T) {
	brokers := os.Getenv("KAFKA_BROKERS")
	if brokers == "" {
		t.Skip("KAFKA_BROKERS not set — skipping broker integration test")
	}

	cl, err := kgo.NewClient(kgo.SeedBrokers(brokers))
	if err != nil {
		t.Fatalf("kgo.NewClient: %v", err)
	}
	defer cl.Close()

	topic := fmt.Sprintf("itest-iot-%d.iot.telemetry.v1", time.Now().UnixNano())
	admin := kadm.NewClient(cl)
	defer func() { _, _ = admin.DeleteTopics(context.Background(), topic) }()

	creator := NewKadmCreator(cl)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := creator.CreateTopic(ctx, topic, 1, 1); err != nil {
		t.Fatalf("first CreateTopic: %v", err)
	}

	td, err := admin.ListTopics(ctx, topic)
	if err != nil {
		t.Fatalf("ListTopics: %v", err)
	}
	if !td.Has(topic) {
		t.Fatalf("topic %q was not created", topic)
	}

	// Second call must fold TOPIC_ALREADY_EXISTS into success.
	if err := creator.CreateTopic(ctx, topic, 1, 1); err != nil {
		t.Errorf("second CreateTopic = %v, want nil (idempotent)", err)
	}
}
