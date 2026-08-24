package cosotel

import (
	"context"
	"log"
	"os"
)

// Start brings up both halves of observability — traces (OTLP push) and metrics (Prometheus pull on
// PROMETHEUS_PORT, default 9464) — and returns one shutdown function covering both.
//
// Both halves are non-fatal by design, and the caller is not offered the choice: a worker whose
// collector is unreachable must keep consuming from Kafka. Failures are logged, not returned.
//
// This exists because the two workers had begun each carrying their own copy of this fourteen-line
// dance, which is precisely the duplication ADR-021 set out to remove — and jscpd caught it
// immediately after it was introduced.
func Start(ctx context.Context, serviceName string) func() {
	shutdowns := make([]func(context.Context) error, 0, 2)

	if metricsShutdown, err := ServeMetrics(os.Getenv("PROMETHEUS_PORT")); err != nil {
		log.Printf("otel metrics warning (non-fatal): %v", err)
	} else {
		shutdowns = append(shutdowns, metricsShutdown)
	}

	if traceShutdown, err := Configure(ctx, serviceName); err != nil {
		log.Printf("otel init warning (non-fatal): %v", err)
	} else {
		shutdowns = append(shutdowns, traceShutdown)
	}

	return func() {
		// context.Background(), not the caller's ctx: shutdown normally runs from a defer after that
		// ctx has been cancelled, and flushing a final batch needs a live context.
		for _, fn := range shutdowns {
			_ = fn(context.Background())
		}
	}
}
