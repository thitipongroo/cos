// Package cosmetrics is the shared Prometheus :9464 exposition for the Go workers.
//
// WHY THIS EXISTS: prometheus.yml scrapes each worker on :9464 and the Helm charts declare a 9464
// containerPort, but a worker that opens no port and emits no metric is a permanently-down target,
// indistinguishable from a real outage. This package is the one implementation of that endpoint,
// shared by analytics-worker and kg-ingestion-worker (ADR-021: shared code lives in coslib, not
// copied per service — the two internal/metrics copies this replaced were a jscpd clone).
//
// It exposes the shared Kafka pipeline counters (defined in and incremented by coskafka) plus the Go
// runtime collectors, so an idle scrape still returns real process data instead of an empty body.
package cosmetrics

import (
	"net/http"
	"os"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/construction-os/coslib/coskafka"
)

// DefaultPort is the port prometheus.yml scrapes and the Helm charts declare.
const DefaultPort = "9464"

// A dedicated registry (not the default one) keeps the exposition to these metrics plus the Go
// runtime collectors, with no globals leaking in from dependencies.
var registry = prometheus.NewRegistry()

func init() {
	registry.MustRegister(coskafka.MessagesConsumed, coskafka.MessagesProduced)
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
