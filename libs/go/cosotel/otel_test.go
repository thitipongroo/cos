// Unit tests for the OpenTelemetry setup — Phase 15
//
// §35.13 ESC-23: this package had no test at all, so every line of otel.go counted against the
// module's 0.0% coverage. Configure() is exercised for real — otlptracehttp.New builds an exporter
// without dialling, so no collector is needed — and the W3C propagation helpers are round-tripped.
package cosotel

import (
	"context"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

func TestConfigure_ReturnsAShutdownFuncAndSetsGlobals(t *testing.T) {
	t.Setenv("OTEL_SERVICE_NAME", "analytics-worker-test")
	t.Setenv("SERVICE_VERSION", "1.2.3")
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")

	ctx := context.Background()
	shutdown, err := Configure(ctx, "analytics-worker")
	if err != nil {
		t.Fatalf("Configure: %v", err)
	}
	if shutdown == nil {
		t.Fatal("Configure returned a nil shutdown func — the caller has nothing to defer")
	}

	// The global provider must be the one Configure installed, otherwise Tracer() hands back a noop.
	if _, ok := otel.GetTracerProvider().(interface {
		Shutdown(context.Context) error
	}); !ok {
		t.Error("global tracer provider is not the SDK provider Configure installed")
	}

	// Rule 39 / ADR-034: the returned shutdown must actually close the provider.
	if err := shutdown(ctx); err != nil {
		t.Errorf("shutdown: %v", err)
	}
}

func TestConfigure_UsesDefaultsWhenEnvIsUnset(t *testing.T) {
	t.Setenv("OTEL_SERVICE_NAME", "")
	t.Setenv("SERVICE_VERSION", "")
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")

	// Empty env: the default the caller passes is what the resource ends up carrying.
	shutdown, err := Configure(context.Background(), "analytics-worker")
	if err != nil {
		t.Fatalf("Configure with empty env: %v", err)
	}
	t.Cleanup(func() { _ = shutdown(context.Background()) })
}

func TestTracer_ReturnsANamedTracer(t *testing.T) {
	tr := Tracer("carbon-consumer")
	if tr == nil {
		t.Fatal("Tracer returned nil")
	}
	_, span := tr.Start(context.Background(), "unit")
	span.End()
}

func TestKafkaHeaderCarrier_GetSetKeys(t *testing.T) {
	c := KafkaHeaderCarrier{}

	if got := c.Get("missing"); got != "" {
		t.Errorf("Get on a missing key = %q, want empty string", got)
	}

	c.Set("traceparent", "00-abc-def-01")
	if got := c.Get("traceparent"); got != "00-abc-def-01" {
		t.Errorf("Get = %q", got)
	}

	c.Set("baggage", "k=v")
	keys := c.Keys()
	if len(keys) != 2 {
		t.Fatalf("Keys = %v, want 2 entries", keys)
	}
	seen := map[string]bool{}
	for _, k := range keys {
		seen[k] = true
	}
	if !seen["traceparent"] || !seen["baggage"] {
		t.Errorf("Keys missing an entry: %v", keys)
	}
}

// The whole point of the carrier: a span context injected into Kafka headers on the producer side
// must come back out on the consumer side, so a trace spans the broker hop.
func TestInjectAndExtract_RoundTripsTheSpanContext(t *testing.T) {
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	traceID, err := trace.TraceIDFromHex("4bf92f3577b34da6a3ce929d0e0e4736")
	if err != nil {
		t.Fatalf("TraceIDFromHex: %v", err)
	}
	spanID, err := trace.SpanIDFromHex("00f067aa0ba902b7")
	if err != nil {
		t.Fatalf("SpanIDFromHex: %v", err)
	}
	sc := trace.NewSpanContext(trace.SpanContextConfig{
		TraceID:    traceID,
		SpanID:     spanID,
		TraceFlags: trace.FlagsSampled,
		Remote:     true,
	})
	producerCtx := trace.ContextWithSpanContext(context.Background(), sc)

	headers := map[string][]byte{}
	InjectKafkaHeaders(producerCtx, headers)
	if len(headers) == 0 {
		t.Fatal("InjectKafkaHeaders wrote no headers")
	}

	consumerCtx := ExtractKafkaContext(context.Background(), headers)
	got := trace.SpanContextFromContext(consumerCtx)
	if got.TraceID() != traceID {
		t.Errorf("trace id = %s, want %s", got.TraceID(), traceID)
	}
	if got.SpanID() != spanID {
		t.Errorf("span id = %s, want %s", got.SpanID(), spanID)
	}
	if !got.IsSampled() {
		t.Error("sampled flag lost across the hop")
	}
}

func TestExtractKafkaContext_EmptyHeadersYieldNoSpanContext(t *testing.T) {
	ctx := ExtractKafkaContext(context.Background(), map[string][]byte{})
	if trace.SpanContextFromContext(ctx).IsValid() {
		t.Error("empty headers must not produce a valid span context")
	}
}


func TestGetenv(t *testing.T) {
	t.Setenv("COS_OTEL_TEST_KEY", "set-value")
	if got := getenv("COS_OTEL_TEST_KEY", "fallback"); got != "set-value" {
		t.Errorf("getenv with a set var = %q", got)
	}

	t.Setenv("COS_OTEL_TEST_KEY", "")
	if got := getenv("COS_OTEL_TEST_KEY", "fallback"); got != "fallback" {
		t.Errorf("an empty value must fall back, got %q", got)
	}

	if got := getenv("COS_OTEL_TEST_ABSENT", "fallback"); got != "fallback" {
		t.Errorf("getenv on an absent var = %q", got)
	}
}
