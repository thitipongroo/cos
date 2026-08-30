package metrics

import (
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// Ingestion lag — the measurement behind master:4290-4291.
//
// master states two budgets for this pipeline and, until 2026-08-29, nothing measured either:
//
//	Data freshness:    15 minutes (acceptable lag from transaction to dashboard)
//	Real-time metrics: < 30 seconds lag (for critical alerts only)
//
// They were stated in the Phase 14 command and enforced nowhere. The gap was easy to keep, because
// a dashboard reading stale numbers looks exactly like a dashboard reading quiet ones — the API
// answers 200 either way, and the SLA is about a delay nobody can see from the outside.
//
// WHAT IS MEASURED, precisely: the wall-clock distance between the event's `occurred_at` — stamped
// by the service that performed the transaction — and the moment this worker begins writing it to
// ClickHouse. That covers produce, broker retention, consumer-group scheduling and any backlog,
// which is where lag actually accumulates.
//
// WHAT IS NOT: ClickHouse's own merge and visibility delay after the insert. An AggregatingMergeTree
// answers from unmerged parts, so a row is queryable almost immediately; the untracked remainder is
// the insert round-trip. Reading the true end-to-end figure would need an `ingested_at DateTime`
// column on all three aggregate tables — the tables carry `event_date Date`, day granularity, which
// cannot express a 30-second budget — and that is a schema change, deliberately not made here.
// The histogram therefore reads slightly LOW. It is a floor on the real lag, never a ceiling, which
// is the safe direction for an alert: it cannot report health that is not there.
var IngestionLag = prometheus.NewHistogramVec(prometheus.HistogramOpts{
	Name: "analytics_ingestion_lag_seconds",
	Help: "Seconds between an event's occurred_at and its arrival at the analytics aggregate write",
	// Buckets straddle BOTH budgets so a single histogram answers both alerts. 30 and 900 are
	// present exactly, because a histogram_quantile between two far-apart buckets is interpolated —
	// without a boundary at the budget, the alert compares against a number Prometheus invented.
	Buckets: []float64{1, 5, 10, 30, 60, 300, 900, 1800, 3600},
}, []string{"event_type"})

// Registered on the DEFAULT registry because that is the one this worker actually serves: main.go
// starts cosotel.Start, whose ServeMetrics hands :9464 to promhttp.Handler() — the default
// registerer. The sibling kg-ingestion-worker serves cosmetrics.Handler() instead, which is a
// dedicated registry; registering there would expose this histogram on a port nothing scrapes for
// this service. The two workers differ, and the difference is easy to miss.
func init() {
	prometheus.MustRegister(IngestionLag)
}

// lagSeconds is the observation, kept pure so the parsing and the clamp are testable without a
// broker, a clock, or a registry.
//
// A NEGATIVE lag means the producer's clock is ahead of this worker's. It is clamped to zero rather
// than observed: a negative sample makes histogram_quantile return nonsense, and the alert would go
// quiet — the one outcome that must never come from a clock skew. Skew large enough to matter is
// visible as a floor of zero-lag samples.
func lagSeconds(occurredAt string, now time.Time) (float64, bool) {
	ts, err := time.Parse(time.RFC3339, occurredAt)
	if err != nil {
		// Same posture as eventDate's caller: an unparseable timestamp is the event's problem and is
		// reported there. Recording a wrong lag would be worse than recording none.
		return 0, false
	}
	seconds := now.Sub(ts).Seconds()
	if seconds < 0 {
		return 0, true
	}
	return seconds, true
}

// observeLag records one event's ingestion lag. Never fails the write: a metric that could break
// ingestion would be a worse fault than the one it exists to detect.
func observeLag(eventType, occurredAt string, now time.Time) {
	if seconds, ok := lagSeconds(occurredAt, now); ok {
		IngestionLag.WithLabelValues(eventType).Observe(seconds)
	}
}
