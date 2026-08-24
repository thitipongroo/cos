package cosotel

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/otel"
	promexporter "go.opentelemetry.io/otel/exporters/prometheus"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
)

// DefaultMetricsPort is the port every COS service exposes Prometheus metrics on. It is not a free
// choice: infrastructure/monitoring/prometheus/prometheus.yml scrapes `<service>:9464` for the
// backend, ai-gateway, file-service and both Go workers, and the Helm charts declare a container
// port named `metrics` at the same number.
const DefaultMetricsPort = "9464"

// ServeMetrics registers an OTel Prometheus exporter as the global meter provider and serves it on
// /metrics. It returns a shutdown function the caller must defer.
//
// Why this exists: the Prometheus scrape config has listed kg-ingestion-worker:9464 and
// analytics-worker:9464 since those jobs were written, and the Helm charts declare the port — but
// nothing in either worker ever listened on it and neither registered a /metrics handler, so both
// scrape targets were permanently down. Traces were exported (OTLP push) and metrics simply were
// not. This brings the Go workers in line with backend/src/main.ts, which configures the same
// exporter on the same port through @cos/tracing.
//
// The listener is separate from the service's own HTTP port on purpose: that port carries health
// and, on kg-ingestion-worker, an admin endpoint, and metrics should not have to share its exposure
// rules.
func ServeMetrics(port string) (func(context.Context) error, error) {
	if port == "" {
		port = DefaultMetricsPort
	}

	exporter, err := promexporter.New()
	if err != nil {
		return nil, fmt.Errorf("prometheus exporter: %w", err)
	}
	provider := sdkmetric.NewMeterProvider(sdkmetric.WithReader(exporter))
	otel.SetMeterProvider(provider)

	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		// ErrServerClosed is the normal outcome of the shutdown below, not a failure.
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			otel.Handle(fmt.Errorf("metrics server: %w", err))
		}
	}()

	return func(ctx context.Context) error {
		return errors.Join(srv.Shutdown(ctx), provider.Shutdown(ctx))
	}, nil
}
