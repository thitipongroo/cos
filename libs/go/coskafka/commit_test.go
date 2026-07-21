package coskafka

import (
	"context"
	"fmt"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
)

// F5 — a poisoned message must not block the partition behind it.
//
// The pipeline's contract is that Handle always reaches a terminal state (processed, skipped, or
// DLQ'd) and never blocks, so franz-go's autocommit advances the offset past every record
// regardless of outcome. This proves it against a real broker: two records are written to the SAME
// partition of one tenant topic — a poison record (tenant_id header mismatched → DLQ) followed by a
// good one — and the good record must still reach the handler. If a DLQ'd message stalled the
// partition, the good record behind it would never arrive and the test would time out.
func TestIntegration_PoisonMessageDoesNotBlockPartition(t *testing.T) {
	brokers := os.Getenv("KAFKA_BROKERS")
	if brokers == "" {
		t.Skip("KAFKA_BROKERS not set — skipping broker integration test")
	}
	url := registryURL(t)

	const tenant = "11111111-1111-1111-1111-111111111111"
	// A distinct topic so this test owns its partitions and its assertions are not disturbed by
	// records other tests left on the shared carbon topic.
	topic := "f5poison-0000-0000-0000-000000000001.carbon.record.created.v1"

	producer, err := kgo.NewClient(
		kgo.SeedBrokers(brokers),
		kgo.AllowAutoTopicCreation(),
		// Pin both records to partition 0 so "behind it on the same partition" is literally true.
		kgo.RecordPartitioner(kgo.ManualPartitioner()),
	)
	if err != nil {
		t.Fatalf("producer: %v", err)
	}
	defer producer.Close()

	golden := goldenBytes(t)
	poison := &kgo.Record{
		Topic: topic, Partition: 0, Value: golden,
		Headers: []kgo.RecordHeader{{Key: "tenant_id", Value: []byte("99999999-9999-9999-9999-999999999999")}},
	}
	good := &kgo.Record{
		Topic: topic, Partition: 0, Value: golden,
		Headers: []kgo.RecordHeader{{Key: "tenant_id", Value: []byte(tenant)}},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	if err := producer.ProduceSync(ctx, poison, good).FirstErr(); err != nil {
		t.Fatalf("produce: %v", err)
	}

	// Count DLQ publishes so the poison's terminal state is observable, not just inferred.
	var dlqCount atomic.Int32
	dlq := &countingDLQ{n: &dlqCount}

	reached := make(chan string, 2)
	consumer := NewConsumer(NewDecoder(url), dlq, nil,
		func(_ context.Context, e *EventEnvelope) error {
			reached <- e.TenantID
			return nil
		}, quietLogger())

	group := fmt.Sprintf("f5-%d", time.Now().UnixNano())
	client, err := kgo.NewClient(
		kgo.SeedBrokers(brokers),
		kgo.ConsumerGroup(group),
		kgo.ConsumeTopics(topic),
		kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
	)
	if err != nil {
		t.Fatalf("consumer: %v", err)
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
	case tid := <-reached:
		// The good record — sequenced AFTER the poison on the same partition — reached the handler,
		// so the poison did not stall the partition.
		if tid != tenant {
			t.Errorf("handler saw tenant %q, want the good record's %q", tid, tenant)
		}
	case <-ctx.Done():
		t.Fatal("good record never reached the handler — the poison message blocked the partition")
	}

	if dlqCount.Load() == 0 {
		t.Error("poison record was not routed to the DLQ")
	}
}

// countingDLQ records that Publish was called without needing a broker round-trip.
type countingDLQ struct{ n *atomic.Int32 }

func (d *countingDLQ) Publish(_ context.Context, _ string, _ []byte, _ string, _ int) error {
	d.n.Add(1)
	return nil
}
