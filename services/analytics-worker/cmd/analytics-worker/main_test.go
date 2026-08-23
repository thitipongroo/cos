//go:build unix

// Unit test for the analytics-worker entrypoint — Phase 15
//
// §35.13 ESC-23: main() is process wiring, but it is not untestable — it serves a health endpoint
// and shuts down on SIGTERM, both of which are observable. Running it in a goroutine and signalling
// the test process exercises the whole function, including the graceful-shutdown path Rule 39
// requires. Only one test may call main(): it registers a handler on http.DefaultServeMux, and a
// second registration of the same pattern panics.
//
// Constrained to unix: it signals its own process with SIGTERM, which Windows has no equivalent
// for. CI runs ubuntu-latest, so the coverage this contributes is measured there.
package main

import (
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"syscall"
	"testing"
	"time"
)

// freePort asks the kernel for an unused port and releases it, so main()'s ListenAndServe binds
// something no other test or CI job is holding. Binding a busy port would hit log.Fatalf and take
// the whole test process down.
func freePort(t *testing.T) string {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve port: %v", err)
	}
	defer func() { _ = l.Close() }()
	_, port, err := net.SplitHostPort(l.Addr().String())
	if err != nil {
		t.Fatalf("split addr: %v", err)
	}
	return port
}

func TestMain_ServesHealthAndShutsDownOnSIGTERM(t *testing.T) {
	port := freePort(t)
	t.Setenv("PORT", port)
	// Point the exporter at a URL that builds cleanly; nothing is dialled at construction time.
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4318")

	done := make(chan struct{})
	go func() {
		defer close(done)
		main()
	}()

	// Wait for the listener to come up rather than sleeping a fixed amount.
	url := "http://127.0.0.1:" + port + "/health/live"
	var resp *http.Response
	var err error
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		resp, err = http.Get(url) //nolint:noctx // short-lived probe against our own listener
		if err == nil {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if err != nil {
		t.Fatalf("health endpoint never came up: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	var payload struct {
		Status  string `json:"status"`
		Service string `json:"service"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("health body is not JSON: %v (%s)", err, body)
	}
	if payload.Status != "ok" || payload.Service != "analytics-worker" {
		t.Errorf("health payload = %+v", payload)
	}

	// SIGTERM must unblock main() and let it return — that is the graceful-shutdown contract.
	if err := syscall.Kill(os.Getpid(), syscall.SIGTERM); err != nil {
		t.Fatalf("signal self: %v", err)
	}

	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("main() did not return within 10s of SIGTERM")
	}
}

