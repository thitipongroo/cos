// Package metrics serves this worker's Prometheus endpoint on :9464.
//
// WHY THIS EXISTS: prometheus.yml has always scraped kg-ingestion-worker:9464 and the Helm chart
// declares a 9464 containerPort and annotates the pod for scraping — but nothing ever opened that
// port or emitted a metric, so the target could never come up and a real outage was
// indistinguishable from the permanently-down scrape. Same defect file-service fixed in
// src/plugins/metrics.ts; this is the Go equivalent.
//
// The Kafka counters exposed here are defined in coslib/coskafka (shared with analytics-worker and
// incremented by the shared consume/DLQ path); this package owns the registry, the Go runtime
// collectors and the HTTP exposition.
package metrics

import (
	"net/http"
	"os"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/construction-os/coslib/coskafka"
)

// DefaultPort is the port prometheus.yml scrapes and the Helm chart declares.
const DefaultPort = "9464"

// A dedicated registry (not the default one) keeps the exposition to these metrics plus the Go
// runtime collectors, with no globals leaking in from dependencies.
var registry = prometheus.NewRegistry()

// Re-exported from coslib/coskafka so this package's exposition — and its tests — refer to the same
// CounterVec the shared consume/DLQ path increments. The counters cannot live here: coskafka is a
// shared module and Go forbids it from importing this service's internal/ package.
var (
	MessagesConsumed = coskafka.MessagesConsumed
	MessagesProduced = coskafka.MessagesProduced
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
