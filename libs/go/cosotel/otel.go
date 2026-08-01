// Package cosotel provides OpenTelemetry SDK setup shared by the Go workers.
// Call Configure() once at startup before processing any Kafka messages.
// Sampling: NONE here — every span is exported and the OTel Collector decides via tail-sampling
// (1% baseline, 100% for errors). Do not add an SDK sampler: it discards spans before the Collector
// can see them, which breaks the "100% of error traces" guarantee. See ADR-075 and spec §31.5.
//
// Extracted from services/{analytics,kg-ingestion}-worker/internal/otel on 2026-07-21 (ADR-021).
// The two copies differed in exactly one behavioural respect — the fallback service name — which is
// now a Configure() parameter. kg-ingestion-worker additionally carried a package-level `shutdownFn`
// that was assigned and never read; it is dropped rather than carried forward.
//
// Named cosotel, not otel: the original package was `package otel` while also importing
// go.opentelemetry.io/otel. That compiles, but every reference to `otel.` in the file is the import,
// not the package being defined, which is a trap for the next reader.
package cosotel

import (
	"context"
	"fmt"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"go.opentelemetry.io/otel/trace"
)

// Configure initialises the OTel trace provider and sets the global tracer.
// Returns a shutdown function that must be deferred by the caller.
//
// defaultServiceName is the fallback used when OTEL_SERVICE_NAME is unset — it is a parameter
// because it is the one thing that legitimately differs between callers. Passing "" is allowed and
// simply leaves the resource without a meaningful service.name; callers should pass their own name.
func Configure(ctx context.Context, defaultServiceName string) (func(context.Context) error, error) {
	serviceName := getenv("OTEL_SERVICE_NAME", defaultServiceName)
	serviceVersion := getenv("SERVICE_VERSION", "0.0.0")
	otlpEndpoint := getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(serviceName),
			semconv.ServiceVersion(serviceVersion),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("otel resource: %w", err)
	}

	exporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpointURL(otlpEndpoint+"/v1/traces"),
		otlptracehttp.WithInsecure(),
	)
	if err != nil {
		return nil, fmt.Errorf("otlp exporter: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
		// No SDK sampler (ADR-075): sampling is TAIL-based at the OTel Collector (spec §31.5, QM-8).
		// Head-sampling here dropped ~99% of spans before the Collector could apply its
		// errors / ai-llm / financial policies, so "100% of error traces" could never hold.
		// The SDK now exports every span and the Collector decides what to keep.
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return func(ctx context.Context) error {
		return tp.Shutdown(ctx)
	}, nil
}

// Tracer returns a named tracer from the global provider.
func Tracer(name string) trace.Tracer {
	return otel.Tracer(name)
}

// KafkaHeaderCarrier adapts Kafka headers (map[string][]byte) to OTel TextMapCarrier.
type KafkaHeaderCarrier map[string][]byte

func (c KafkaHeaderCarrier) Get(key string) string {
	if v, ok := c[key]; ok {
		return string(v)
	}
	return ""
}

func (c KafkaHeaderCarrier) Set(key, value string) {
	c[key] = []byte(value)
}

func (c KafkaHeaderCarrier) Keys() []string {
	keys := make([]string, 0, len(c))
	for k := range c {
		keys = append(keys, k)
	}
	return keys
}

// InjectKafkaHeaders injects the active span context into Kafka message headers.
func InjectKafkaHeaders(ctx context.Context, headers map[string][]byte) {
	otel.GetTextMapPropagator().Inject(ctx, KafkaHeaderCarrier(headers))
}

// ExtractKafkaContext extracts a span context from Kafka message headers.
func ExtractKafkaContext(ctx context.Context, headers map[string][]byte) context.Context {
	return otel.GetTextMapPropagator().Extract(ctx, KafkaHeaderCarrier(headers))
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
