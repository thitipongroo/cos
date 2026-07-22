// Package metrics serves this worker's Prometheus endpoint.
//
// WHY THIS EXISTS: prometheus.yml has always scraped kg-ingestion-worker:9464 and the Helm chart
// declares a 9464 containerPort and annotates the pod for scraping — but nothing ever opened that
// port or emitted a metric, so the target could never come up and a real outage was
// indistinguishable from the permanently-down scrape. Same defect file-service fixed in
// src/plugins/metrics.ts; this is the Go equivalent.
//
// Metric names, help text and label sets match packages/@cos/shared/src/kafka/metrics.ts exactly,
// so one Grafana panel and the existing alert rules cover the TypeScript and Go consumers alike.
//
// DELIBERATELY NOT EMITTED HERE:
//   - kafka_consumer_lag  — requires querying group offsets via the admin API, not something the
//     consume loop knows. The TypeScript side publishes it.
//   - kafka_dlq_depth     — a gauge of how many messages are SITTING in a DLQ topic. A producer
//     only knows how many it wrote, which is a different number; reporting one as the other would
//     make the KafkaDLQNonEmpty alert lie. DLQ writes show up as kafka_messages_produced_total on
//     the .dlq topic instead.
package metrics

import (
	"net/http"
	"os"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// DefaultPort is the port prometheus.yml scrapes and the Helm chart declares.
const DefaultPort = "9464"

// A dedicated registry (not the default one) keeps the exposition to these metrics plus the Go
// runtime collectors, with no globals leaking in from dependencies.
var registry = prometheus.NewRegistry()

var (
	// MessagesConsumed counts records that completed the pipeline successfully.
	MessagesConsumed = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "kafka_messages_consumed_total",
		Help: "Total Kafka messages successfully consumed",
	}, []string{"topic", "consumer_group", "event_type"})

	// MessagesProduced counts records this worker wrote — today that is DLQ writes.
	MessagesProduced = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "kafka_messages_produced_total",
		Help: "Total Kafka messages successfully produced",
	}, []string{"topic", "event_type"})
)

func init() {
	registry.MustRegister(MessagesConsumed, MessagesProduced)
	// The Kafka counters are label-partitioned, so they expose no series until the first message
	// flows. Without the runtime collectors a scrape of an idle worker returns an EMPTY body —
	// technically a healthy target, but one that proves nothing and leaves every panel blank.
	// These make an idle scrape return real process data (goroutines, heap, fds, uptime).
	registry.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)
}

// Handler serves the Prometheus exposition format.
func Handler() http.Handler {
	return promhttp.HandlerFor(registry, promhttp.HandlerOpts{})
}

// Port resolves the scrape port, falling back to DefaultPort.
func Port() string {
	if p := os.Getenv("PROMETHEUS_PORT"); p != "" {
		return p
	}
	return DefaultPort
}
