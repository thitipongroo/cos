// Construction OS — Analytics Worker
// Phase 15: OpenTelemetry — OTLP trace exporter, W3C propagation, Kafka header injection.
// Source: context/00_master_construction_os.md §Phase 15
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	_ "github.com/ClickHouse/clickhouse-go/v2"

	"github.com/construction-os/analytics-worker/internal/carbon"
	"github.com/construction-os/analytics-worker/internal/metrics"
	cosOtel "github.com/construction-os/coslib/cosotel"
)

// defaultHTTPPort is the liveness port when PORT is unset.
//
// MUST equal the Dockerfile's EXPOSE, the docker-compose healthcheck, and the Helm chart's
// containerPort/probe port. It was 8091 while every one of those said 8090 or 8080: the Helm chart
// probed httpGet /health/live on 8080 and never set PORT, so on a real cluster the probe hit a
// closed port and the pod could only ever CrashLoopBackOff. Compose masked it by setting PORT=8090.
// Keeping the code default equal to the deployed port means a missing PORT env degrades to
// "correct" instead of "dead" (ADR-039: lint and dry-run do not catch this — only a real deploy).
const defaultHTTPPort = "8090"

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// healthHandler serves the liveness endpoint the Kubernetes probe and the compose healthcheck call.
// Extracted from main so the contract (path, status, body) is unit-testable.
func healthHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health/live", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"ok","service":"analytics-worker"}`)
	})
	return mux
}

// openClickHouse dials the OLAP store the carbon consumer writes to.
//
// database/sql opens lazily, so Ping is required to surface a bad DSN or an unreachable server here
// rather than on the first Kafka message — the caller degrades to "carbon disabled" on error.
func openClickHouse() (*sql.DB, error) {
	dsn := getEnv("CLICKHOUSE_DSN", "clickhouse://localhost:9000/analytics")
	db, err := sql.Open("clickhouse", dsn)
	if err != nil {
		return nil, fmt.Errorf("open: %w", err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return db, nil
}

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Traces (OTLP push) and metrics (Prometheus on :9464) — both non-fatal, see cosotel.Start.
	defer cosOtel.Start(ctx, "analytics-worker")()

	// Phase 24 carbon analytics (spec §33.3 — carbon aggregations run in this worker, Go →
	// ClickHouse). Both the ClickHouse connection and the consumer are non-fatal on failure: this
	// process also serves the health endpoint, and a carbon outage must not take that down.
	if db, err := openClickHouse(); err != nil {
		log.Printf("clickhouse init warning (carbon analytics disabled): %v", err)
	} else {
		defer func() { _ = db.Close() }()
		cfg := carbon.Config{
			Brokers:     strings.Split(getEnv("KAFKA_BROKERS", "localhost:9092"), ","),
			RegistryURL: getEnv("SCHEMA_REGISTRY_URL", "http://localhost:8081"),
			RedisURL:    getEnv("REDIS_URL", ""),
		}
		go func() {
			if err := carbon.Start(ctx, cfg, db); err != nil {
				log.Printf("carbon consumer stopped: %v", err)
			}
		}()
		log.Printf("carbon consumer started (brokers=%v registry=%s)", cfg.Brokers, cfg.RegistryURL)

		// Phase 14 dashboard aggregates. This ingestion used to be ClickHouse Kafka engine tables,
		// which subscribed to bare event names and therefore to topics that never exist — see the
		// header of internal/metrics/consumer.go. Same non-fatal posture as carbon: a metrics outage
		// must not take down the health endpoint this process also serves.
		metricsCfg := metrics.Config{
			Brokers:     cfg.Brokers,
			RegistryURL: cfg.RegistryURL,
			RedisURL:    cfg.RedisURL,
		}
		go func() {
			if err := metrics.Start(ctx, metricsCfg, db); err != nil {
				log.Printf("metrics consumer stopped: %v", err)
			}
		}()
		log.Printf("metrics consumer started (group=%s)", metrics.ConsumerGroup)
	}

	http.HandleFunc("/health/live", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","service":"analytics-worker"}`)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8091"
	}

	// Explicit server, not http.ListenAndServe: the package-level helper has no timeouts at all,
	// so a client that opens a connection and never finishes its request headers holds a goroutine
	// indefinitely (Slowloris). ReadHeaderTimeout is the one that closes that specific hole.
	// Flagged by gosec G114 (CWE-676). The Semgrep registry packs flag this same line, but for a
	// different reason (go.lang.security.audit.net.use-tls — plaintext HTTP); no rule in p/golang
	// covers the missing timeout. CodeQL has not been run against this repository yet, so nothing
	// is claimed about it here.
	//
	// Note what this change did NOT fix: the port still serves plaintext. Switching from
	// http.ListenAndServe to srv.ListenAndServe also stops the use-tls rule matching, because its
	// pattern is the package-level helper — so that finding is now invisible to Semgrep without
	// having been addressed.
	srv := &http.Server{
		Addr:              ":" + port,
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		log.Printf("analytics-worker listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil {
			log.Fatalf("http server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("analytics-worker shutting down")
	cancel()
}
