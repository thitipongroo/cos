// Construction OS — KG Ingestion Worker
// Phase 13: Knowledge Graph — Kafka consumer + Neo4j writer + admin rebuild endpoint.
// Phase 15: OpenTelemetry — OTLP trace exporter, W3C propagation, Kafka header injection.
// Source: context/00_master_construction_os.md §Phase 13, §Phase 15
package main

import (
	"context"
	"crypto/subtle"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/construction-os/coslib/cosmetrics"
	cosOtel "github.com/construction-os/coslib/cosotel"
	"github.com/construction-os/kg-ingestion-worker/internal/consumer"
	"github.com/construction-os/kg-ingestion-worker/internal/graph"
	neo4j "github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Traces (OTLP push) and metrics (Prometheus on :9464) — both non-fatal, see cosotel.Start.
	defer cosOtel.Start(ctx, "kg-ingestion-worker")()

	neo4jURI := getEnv("NEO4J_URI", "bolt://localhost:7687")
	neo4jUser := getEnv("NEO4J_USERNAME", "neo4j")
	neo4jPass := getEnv("NEO4J_PASSWORD", "")
	consumerCfg := consumer.Config{
		Brokers:     strings.Split(getEnv("KAFKA_BROKERS", "localhost:9092"), ","),
		RegistryURL: getEnv("SCHEMA_REGISTRY_URL", "http://localhost:8081"),
		RedisURL:    getEnv("REDIS_URL", ""),
	}
	port := getEnv("PORT", defaultHTTPPort)

	driver, err := neo4j.NewDriverWithContext(neo4jURI, neo4j.BasicAuth(neo4jUser, neo4jPass, ""))
	if err != nil {
		log.Fatalf("neo4j driver: %v", err)
	}
	defer driver.Close(context.Background())

	if err := graph.ApplyConstraints(ctx, driver); err != nil {
		log.Fatalf("apply constraints: %v", err)
	}

	// rebuild channel: receiving true triggers a full offset reset and re-consume
	rebuildCh := make(chan bool, 1)
	var wg sync.WaitGroup

	startConsumer := func(resetOffset bool) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := consumer.Start(ctx, consumerCfg, driver, resetOffset); err != nil {
				if ctx.Err() == nil {
					log.Printf("consumer exited: %v", err)
				}
			}
		}()
	}

	startConsumer(false)

	// admin rebuild handler — POST /admin/rebuild
	// replays all events from the beginning per spec §Phase 13 Full rebuild
	//
	// Authenticated, and fail-closed when KG_ADMIN_TOKEN is unset. Until this guard the endpoint
	// took an unauthenticated POST from anything that could reach the pod, and nothing stopped that:
	// spec §5.4 leans on Istio mTLS for service-to-service trust, but no Istio manifest exists in
	// infrastructure/, and the repository's only NetworkPolicy selects
	// `cos.io/cloudflare-protected: 'true'`, a label no chart sets — so there is no default-deny
	// either. A queued rebuild replays the whole topic from the oldest offset.
	adminToken := getEnv("KG_ADMIN_TOKEN", "")
	if adminToken == "" {
		log.Print("KG_ADMIN_TOKEN is unset — POST /admin/rebuild will refuse every request")
	}
	http.HandleFunc("/admin/rebuild", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !adminAuthorized(adminToken, r.Header.Get("Authorization")) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		select {
		case rebuildCh <- true:
			w.WriteHeader(http.StatusAccepted)
			fmt.Fprintf(w, `{"status":"rebuild_queued"}`)
		default:
			http.Error(w, "rebuild already in progress", http.StatusConflict)
		}
	})

	http.HandleFunc("/health/live", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok"}`)
	})

	// Prometheus scrape endpoint. prometheus.yml has always listed kg-ingestion-worker:9464 as a
	// target and the Helm chart declares the containerPort — until now nothing served it.
	metricsPort := cosmetrics.Port()
	go func() {
		mux := http.NewServeMux()
		mux.Handle("/metrics", cosmetrics.Handler())
		log.Printf("kg-ingestion-worker metrics listening on :%s", metricsPort)
		if err := http.ListenAndServe(":"+metricsPort, mux); err != nil {
			log.Fatalf("metrics server: %v", err)
		}
	}()

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
		log.Printf("kg-ingestion-worker listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil {
			log.Fatalf("http server: %v", err)
		}
	}()

	// rebuild loop: when rebuild is requested, cancel current consumer and restart from oldest
	go func() {
		for range rebuildCh {
			log.Println("admin rebuild: restarting consumer from OffsetOldest")
			cancel()
			wg.Wait()
			ctx, cancel = context.WithCancel(context.Background())
			startConsumer(true)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down")
	cancel()
	wg.Wait()
}

// defaultHTTPPort is the liveness port when PORT is unset.
//
// MUST equal the Dockerfile's EXPOSE and the Helm chart's containerPort/probe port. The chart used
// to probe `pgrep kg-ingestion-worker` instead — but the Dockerfile builds the binary as `worker`
// (go build -o worker; CMD ["./worker"]), so pgrep matched no process, both probes exited 1, and the
// pod could only CrashLoopBackOff. This service does serve GET /health/live on this port, so the
// chart now probes that (ADR-039: only a real deploy catches this, lint and dry-run do not).
const defaultHTTPPort = "8090"

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// adminAuthorized reports whether header carries the expected bearer token.
//
// Fail-closed: an empty expected token authorises nothing, so a deployment that forgets to set
// KG_ADMIN_TOKEN disables the endpoint rather than leaving it open. The comparison is
// constant-time — a byte-wise == on a secret leaks its prefix to a timing oracle.
func adminAuthorized(expected, header string) bool {
	if expected == "" {
		return false
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return false
	}
	got := strings.TrimPrefix(header, prefix)
	return subtle.ConstantTimeCompare([]byte(got), []byte(expected)) == 1
}
