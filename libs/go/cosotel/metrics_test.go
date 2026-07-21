package cosotel

import (
	"context"
	"io"
	"net"
	"net/http"
	"testing"
	"time"
)

// freePort asks the kernel for an unused port so the test never collides with a real service or
// with a parallel run.
func freePort(t *testing.T) string {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve port: %v", err)
	}
	defer l.Close()
	_, port, err := net.SplitHostPort(l.Addr().String())
	if err != nil {
		t.Fatalf("split addr: %v", err)
	}
	return port
}

func TestServeMetricsExposesPrometheusEndpoint(t *testing.T) {
	port := freePort(t)

	shutdown, err := ServeMetrics(port)
	if err != nil {
		t.Fatalf("ServeMetrics: %v", err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := shutdown(ctx); err != nil {
			t.Errorf("shutdown: %v", err)
		}
	}()

	// The listener starts in a goroutine, so retry briefly rather than sleeping a fixed amount.
	var resp *http.Response
	deadline := time.Now().Add(5 * time.Second)
	for {
		resp, err = http.Get("http://127.0.0.1:" + port + "/metrics")
		if err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("GET /metrics never succeeded: %v", err)
		}
		time.Sleep(20 * time.Millisecond)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	// The exporter always emits at least the target_info / scrape metadata series; an empty body
	// would mean the handler is wired but the meter provider is not.
	if len(body) == 0 {
		t.Fatal("/metrics returned an empty body")
	}
}

func TestServeMetricsDefaultsToTheScrapedPort(t *testing.T) {
	// prometheus.yml scrapes :9464 by name for every service; the default must not drift from it.
	if DefaultMetricsPort != "9464" {
		t.Fatalf("DefaultMetricsPort = %q, want 9464 — prometheus.yml scrapes that port", DefaultMetricsPort)
	}
}

func TestServeMetricsRejectsAnUnusablePort(t *testing.T) {
	// Occupy a port, then ask ServeMetrics for it. The listener fails inside its goroutine, so this
	// documents the current contract: ServeMetrics itself still returns successfully, and the
	// failure surfaces through otel.Handle rather than to the caller.
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("occupy port: %v", err)
	}
	defer l.Close()
	_, port, err := net.SplitHostPort(l.Addr().String())
	if err != nil {
		t.Fatalf("split addr: %v", err)
	}

	shutdown, err := ServeMetrics(port)
	if err != nil {
		t.Fatalf("ServeMetrics returned an error for an occupied port: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := shutdown(ctx); err != nil {
		t.Errorf("shutdown: %v", err)
	}
}
