// Tests for the carbon wiring in the worker entrypoint.
//
// §35.13 ESC-23: this branch of main — "ClickHouse opened, so start the carbon consumer" — was the
// one part of the worker no test reached, because reaching it through main() needs a live
// ClickHouse. It is now `startCarbon(ctx, db)`, which takes the handle as a parameter, so a test
// double is enough.

package main

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/construction-os/analytics-worker/internal/carbon"
)

// ─── a database/sql handle that dials nothing ────────────────────────────────

type stubConn struct{}

func (stubConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("not used") }
func (stubConn) Close() error                        { return nil }
func (stubConn) Begin() (driver.Tx, error)           { return nil, errors.New("not used") }

type stubDriver struct{}

func (stubDriver) Open(string) (driver.Conn, error) { return stubConn{}, nil }

var stubSeq int

func stubDB(t *testing.T) *sql.DB {
	t.Helper()
	stubSeq++
	name := "wiring-stub-" + time.Now().Format("150405.000000000") + string(rune('a'+stubSeq%26))
	sql.Register(name, stubDriver{})
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatalf("open stub db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// ─── carbonConfigFromEnv ─────────────────────────────────────────────────────

func TestCarbonConfigFromEnv_UsesTheComposeDefaults(t *testing.T) {
	t.Setenv("KAFKA_BROKERS", "")
	t.Setenv("SCHEMA_REGISTRY_URL", "")
	t.Setenv("REDIS_URL", "")

	cfg := carbonConfigFromEnv()

	if len(cfg.Brokers) != 1 || cfg.Brokers[0] != "localhost:9092" {
		t.Errorf("Brokers = %v, want [localhost:9092]", cfg.Brokers)
	}
	if cfg.RegistryURL != "http://localhost:8081" {
		t.Errorf("RegistryURL = %q", cfg.RegistryURL)
	}
	// Empty, not a default: an unset REDIS_URL means "run without idempotency" (see carbon.Start),
	// so inventing a localhost default here would make the consumer wait on a Redis nobody deployed.
	if cfg.RedisURL != "" {
		t.Errorf("RedisURL = %q, want empty when unset", cfg.RedisURL)
	}
}

func TestCarbonConfigFromEnv_SplitsAMultiBrokerList(t *testing.T) {
	t.Setenv("KAFKA_BROKERS", "b1:9092,b2:9092,b3:9092")
	t.Setenv("SCHEMA_REGISTRY_URL", "http://registry:8081")
	t.Setenv("REDIS_URL", "redis://cache:6379")

	cfg := carbonConfigFromEnv()

	want := []string{"b1:9092", "b2:9092", "b3:9092"}
	if len(cfg.Brokers) != len(want) {
		t.Fatalf("Brokers = %v, want %v", cfg.Brokers, want)
	}
	for i, b := range want {
		if cfg.Brokers[i] != b {
			t.Errorf("Brokers[%d] = %q, want %q", i, cfg.Brokers[i], b)
		}
	}
	if cfg.RegistryURL != "http://registry:8081" || cfg.RedisURL != "redis://cache:6379" {
		t.Errorf("endpoints not carried through: %+v", cfg)
	}
}

// ─── startCarbon ─────────────────────────────────────────────────────────────

func TestStartCarbon_ReturnsTheConfigItLaunchedWith(t *testing.T) {
	t.Setenv("KAFKA_BROKERS", "127.0.0.1:1")
	t.Setenv("SCHEMA_REGISTRY_URL", "http://127.0.0.1:1")
	t.Setenv("REDIS_URL", "")

	ctx, cancel := context.WithCancel(context.Background())
	cfg := startCarbon(ctx, stubDB(t))

	if len(cfg.Brokers) != 1 || cfg.Brokers[0] != "127.0.0.1:1" {
		t.Errorf("Brokers = %v", cfg.Brokers)
	}
	if cfg.RegistryURL != "http://127.0.0.1:1" {
		t.Errorf("RegistryURL = %q", cfg.RegistryURL)
	}

	// The consumer runs in the background: cancelling is what stops it, and startCarbon must not
	// have blocked waiting for it.
	cancel()
	// Give the goroutine a moment to observe the cancellation, so the test does not leave it
	// running into the next case.
	time.Sleep(100 * time.Millisecond)
}

func TestStartCarbon_DoesNotBlockOnAnUnreachableBroker(t *testing.T) {
	// The worker also serves the liveness endpoint. If starting the consumer blocked, an unreachable
	// broker would take the health probe down with it — the failure mode this arrangement avoids.
	t.Setenv("KAFKA_BROKERS", "127.0.0.1:1")
	t.Setenv("SCHEMA_REGISTRY_URL", "http://127.0.0.1:1")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan carbon.Config, 1)
	go func() { done <- startCarbon(ctx, stubDB(t)) }()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("startCarbon blocked — the health endpoint would be starved by a broker outage")
	}
}

func TestStartCarbon_LogsAndReturnsWhenTheConsumerCannotStart(t *testing.T) {
	// No broker at all: carbon.Start fails building its DLQ publisher and returns immediately. The
	// goroutine has to log that and exit — the worker keeps serving liveness either way, which is
	// the whole reason the consumer is started in the background rather than inline.
	t.Setenv("KAFKA_BROKERS", "broker:not-a-port")
	t.Setenv("SCHEMA_REGISTRY_URL", "http://127.0.0.1:1")
	t.Setenv("REDIS_URL", "")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	startCarbon(ctx, stubDB(t))

	// carbon.Start returns before it dials anything in this case, so a short wait is enough for the
	// goroutine to run its error path to completion.
	time.Sleep(500 * time.Millisecond)
}

// ─── openClickHouse ──────────────────────────────────────────────────────────

func TestOpenClickHouse_ReportsAMalformedDSNAtOpen(t *testing.T) {
	// clickhouse-go parses the DSN lazily, so a malformed one surfaces at Ping rather than at
	// sql.Open — which is exactly why openClickHouse pings instead of trusting Open. Without it a
	// bad DSN would only be discovered on the first Kafka message, long after startup.
	t.Setenv("CLICKHOUSE_DSN", "://not a dsn")

	db, err := openClickHouse()
	if err == nil {
		_ = db.Close()
		t.Fatal("expected a malformed DSN to be rejected")
	}
	if !strings.Contains(err.Error(), "ping:") {
		t.Errorf("error does not name the stage: %v", err)
	}
}

// ─── the liveness port ───────────────────────────────────────────────────────

func TestDefaultHTTPPortMatchesTheDockerfile(t *testing.T) {
	// The constant exists because the fallback and the deployed port drifted apart once: the Helm
	// probe hit a closed port and the pod could only CrashLoopBackOff. Asserting the value here is
	// what keeps the code default and the EXPOSE in step.
	if defaultHTTPPort != "8090" {
		t.Errorf("defaultHTTPPort = %q, want 8090 (Dockerfile EXPOSE)", defaultHTTPPort)
	}
	t.Setenv("PORT", "")
	if got := getEnv("PORT", defaultHTTPPort); got != "8090" {
		t.Errorf("with PORT unset the worker would listen on %q", got)
	}
}

// ─── startCarbonIfAvailable ──────────────────────────────────────────────────

func TestStartCarbonIfAvailable_StartsTheConsumerAndClosesTheHandle(t *testing.T) {
	t.Setenv("KAFKA_BROKERS", "127.0.0.1:1")
	t.Setenv("SCHEMA_REGISTRY_URL", "http://127.0.0.1:1")
	t.Setenv("REDIS_URL", "")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	db := stubDB(t)
	cleanup := startCarbonIfAvailable(ctx, func() (*sql.DB, error) { return db, nil })
	if cleanup == nil {
		t.Fatal("no cleanup returned — main defers this, so a nil would panic on shutdown")
	}

	// The handle must be closed by the cleanup, not left to the process exiting: Rule 39 / ADR-034.
	cleanup()
	if err := db.Ping(); err == nil {
		t.Error("the ClickHouse handle was still usable after cleanup — it was not closed")
	}
}

func TestStartCarbonIfAvailable_DegradesWhenClickHouseIsUnavailable(t *testing.T) {
	// Carbon ingestion is optional; the liveness endpoint is not. A ClickHouse failure must leave a
	// usable cleanup and let main carry on serving health.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cleanup := startCarbonIfAvailable(ctx, func() (*sql.DB, error) {
		return nil, errors.New("dial tcp: connection refused")
	})
	if cleanup == nil {
		t.Fatal("no cleanup returned on the failure path")
	}
	cleanup() // must be safe to call even though nothing was opened
}
