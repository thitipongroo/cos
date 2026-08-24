//go:build unix

// Runs main() end to end and shuts it down with a signal.
//
// §35.13 ESC-45: main() was at 0%. It is process wiring, but it is not untestable — it opens Neo4j,
// applies the constraints, starts the consumer supervisor, serves the liveness endpoint and stops on
// SIGTERM, and every one of those is observable from outside.
//
// It needs a real Neo4j because the alternative branch is `log.Fatalf`, which would take the test
// binary with it. The module already depends on testcontainers for the integration suite, so this
// costs one more container and covers the whole startup path in exchange.
//
// Only one test may call main(): the second call would try to bind the same ports and register a
// second signal handler. Constrained to unix because it signals its own process; CI runs
// ubuntu-latest, which is where this coverage is measured.

package main

import (
	"context"
	"io"
	"net"
	"net/http"
	"os"
	"syscall"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go/modules/neo4j"
)

// freePorts reserves n ports at once and releases them together.
//
// Reserving them one at a time handed back the same number twice, and reserving them before the
// Neo4j container started raced Docker's own ephemeral port mapping — either way main() hit
// "address already in use" and log.Fatalf took the test binary with it. Holding every listener open
// until all the numbers are known is what makes them distinct and unclaimed.
func freePorts(t *testing.T, n int) []string {
	t.Helper()
	listeners := make([]net.Listener, 0, n)
	ports := make([]string, 0, n)
	for i := 0; i < n; i++ {
		l, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatalf("reserve port: %v", err)
		}
		listeners = append(listeners, l)
		_, port, err := net.SplitHostPort(l.Addr().String())
		if err != nil {
			t.Fatalf("split addr: %v", err)
		}
		ports = append(ports, port)
	}
	for _, l := range listeners {
		_ = l.Close()
	}
	return ports
}

func TestMain_ServesLivenessAndShutsDownOnSIGTERM(t *testing.T) {
	ctx := context.Background()

	container, err := neo4j.Run(ctx, "neo4j:5", neo4j.WithoutAuthentication())
	if err != nil {
		t.Fatalf("start neo4j: %v", err)
	}
	t.Cleanup(func() { _ = container.Terminate(ctx) })

	boltURI, err := container.BoltUrl(ctx)
	if err != nil {
		t.Fatalf("bolt url: %v", err)
	}

	// After the container is up, so Docker's own mappings are already claimed.
	ports := freePorts(t, 2)
	httpPort, metricsPort := ports[0], ports[1]

	t.Setenv("NEO4J_URI", boltURI)
	t.Setenv("NEO4J_USERNAME", "")
	t.Setenv("NEO4J_PASSWORD", "")
	t.Setenv("PORT", httpPort)
	t.Setenv("PROMETHEUS_PORT", metricsPort)
	// No broker is reachable. The consumer goroutine reports that and the process carries on — the
	// liveness endpoint must stay up, which is the whole reason the consumer runs in the background.
	t.Setenv("KAFKA_BROKERS", "127.0.0.1:1")
	t.Setenv("SCHEMA_REGISTRY_URL", "http://127.0.0.1:1")
	t.Setenv("REDIS_URL", "")
	t.Setenv("KG_ADMIN_TOKEN", "")
	t.Setenv("OTEL_SDK_DISABLED", "true")

	done := make(chan struct{})
	go func() {
		defer close(done)
		main()
	}()

	// The endpoint answering is the proof that startup got all the way through: driver open,
	// constraints applied, supervisor started, server listening.
	deadline := time.Now().Add(60 * time.Second)
	var body []byte
	for time.Now().Before(deadline) {
		resp, err := http.Get("http://127.0.0.1:" + httpPort + "/health/live")
		if err == nil {
			body, _ = io.ReadAll(resp.Body)
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				break
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	if string(body) != `{"status":"ok"}` {
		t.Fatalf("liveness never answered as expected, last body: %q", body)
	}

	// Rule 39 / ADR-034: SIGTERM must bring it down cleanly, not leave the process to be killed.
	if err := syscall.Kill(syscall.Getpid(), syscall.SIGTERM); err != nil {
		t.Fatalf("signal self: %v", err)
	}
	select {
	case <-done:
	case <-time.After(30 * time.Second):
		t.Fatal("main() did not return after SIGTERM — shutdown is not clean")
	}
	_ = os.Getpid() // keep the os import honest if the assertions above change
}
