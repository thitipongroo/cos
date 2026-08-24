package coskafka

import "github.com/prometheus/client_golang/prometheus"

// Kafka pipeline counters shared by every Go worker's consume/DLQ path.
//
// They live here, next to the code that increments them (consumer.go, dlq.go), rather than in each
// worker's internal/metrics package: coskafka is a shared module and Go forbids it from importing a
// service's internal/ package, so the counters the shared pipeline touches must be shared too. Each
// worker's internal/metrics re-exports and registers these into its own registry and serves them on
// :9464 — coskafka defines and increments; it never registers or exposes.
//
// Metric names, help text and label sets match packages/@cos/shared/src/kafka/metrics.ts exactly,
// so one Grafana panel and the existing alert rules cover the TypeScript and Go consumers alike.
//
// DELIBERATELY NOT DEFINED HERE:
//   - kafka_consumer_lag  — requires querying group offsets via the admin API, not something the
//     consume loop knows. The TypeScript side publishes it.
//   - kafka_dlq_depth     — a gauge of how many messages are SITTING in a DLQ topic. A producer
//     only knows how many it wrote, which is a different number; reporting one as the other would
//     make the KafkaDLQNonEmpty alert lie. DLQ writes show up as kafka_messages_produced_total on
//     the .dlq topic instead.
var (
	// MessagesConsumed counts records that completed the pipeline successfully.
	MessagesConsumed = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "kafka_messages_consumed_total",
		Help: "Total Kafka messages successfully consumed",
	}, []string{"topic", "consumer_group", "event_type"})

	// MessagesProduced counts records a worker wrote — today that is DLQ writes.
	MessagesProduced = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "kafka_messages_produced_total",
		Help: "Total Kafka messages successfully produced",
	}, []string{"topic", "event_type"})
)
