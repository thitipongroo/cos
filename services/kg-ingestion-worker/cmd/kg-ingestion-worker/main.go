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
	consumerCfg := consumerConfigFromEnv()
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
	sup := newSupervisor(ctx, cancel, func(runCtx context.Context, resetOffset bool) error {
		return consumer.Start(runCtx, consumerCfg, driver, resetOffset)
	})

	sup.start(false)

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
	mux := http.NewServeMux()
	mux.Handle("/admin/rebuild", adminRebuildHandler(adminToken, rebuildCh))
	mux.Handle("/health/live", livenessHandler())

	// The Prometheus endpoint prometheus.yml scrapes (kg-ingestion-worker:9464) is served by
	// cosOtel.Start above — it calls cosotel.ServeMetrics(PROMETHEUS_PORT), which binds that port and
	// handles /metrics.
	//
	// This function used to start a SECOND server on the same port via cosmetrics.Port(): both read
	// PROMETHEUS_PORT and both default to 9464 (cosotel.DefaultMetricsPort == cosmetrics.DefaultPort),
	// so the second bind always failed with "address already in use" — and it failed through
	// log.Fatalf, so the worker died during startup every time, whether or not PROMETHEUS_PORT was
	// set. analytics-worker never had the duplicate; only this service did. Found 2026-08-25 by the
	// first test ever to run main() (§35.13 ESC-46).

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
		Addr: ":" + port,
		// The mux built above, not http.DefaultServeMux: it is the one the handler tests exercise,
		// so the admin and liveness contracts cannot drift from what is asserted.
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		log.Printf("kg-ingestion-worker listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil {
			log.Fatalf("http server: %v", err)
		}
	}()

	go sup.serveRebuilds(rebuildCh)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down")
	sup.stop()
}

// consumerConfigFromEnv reads the consumer's endpoints, with the compose defaults.
//
// An unset REDIS_URL stays empty rather than defaulting to localhost: consumer.Start reads that as
// "run without idempotency", and inventing a default would make the worker wait on a Redis nobody
// deployed.
func consumerConfigFromEnv() consumer.Config {
	return consumer.Config{
		Brokers:     strings.Split(getEnv("KAFKA_BROKERS", "localhost:9092"), ","),
		RegistryURL: getEnv("SCHEMA_REGISTRY_URL", "http://localhost:8081"),
		RedisURL:    getEnv("REDIS_URL", ""),
	}
}

// runFunc is what the supervisor restarts. It exists so the supervisor can be tested without a
// Kafka broker: in main it is consumer.Start.
type runFunc func(ctx context.Context, resetOffset bool) error

// supervisor owns the consumer goroutine and the rebuild restart.
//
// A rebuild is not a signal the consumer handles itself — it has to be STOPPED and started again
// under a fresh context, because a full replay runs under a throwaway consumer group from the
// oldest offset. Getting the order wrong (restarting before the old consumer has exited) leaves two
// consumers writing the same graph. That sequencing lived in a closure inside main(), where no test
// could reach it; it is here so it can be.
type supervisor struct {
	mu     sync.Mutex
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
	run    runFunc
}

func newSupervisor(ctx context.Context, cancel context.CancelFunc, run runFunc) *supervisor {
	return &supervisor{ctx: ctx, cancel: cancel, run: run}
}

func (s *supervisor) start(resetOffset bool) {
	s.mu.Lock()
	runCtx := s.ctx
	s.mu.Unlock()

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		if err := s.run(runCtx, resetOffset); err != nil {
			// A cancelled context is a shutdown, not a failure — do not log it as one.
			if runCtx.Err() == nil {
				log.Printf("consumer exited: %v", err)
			}
		}
	}()
}

// serveRebuilds restarts the consumer from the oldest offset for every request on ch, and returns
// when ch is closed.
func (s *supervisor) serveRebuilds(ch <-chan bool) {
	for range ch {
		log.Println("admin rebuild: restarting consumer from OffsetOldest")
		s.mu.Lock()
		s.cancel()
		s.mu.Unlock()
		s.wg.Wait() // the old consumer must be gone before the new one starts

		s.mu.Lock()
		s.ctx, s.cancel = context.WithCancel(context.Background())
		s.mu.Unlock()
		s.start(true)
	}
}

// stop cancels the running consumer and waits for it.
func (s *supervisor) stop() {
	s.mu.Lock()
	s.cancel()
	s.mu.Unlock()
	s.wg.Wait()
}

// adminRebuildHandler serves POST /admin/rebuild.
//
// Fail-closed: with KG_ADMIN_TOKEN unset, adminAuthorized rejects everything. Until that guard the
// endpoint took an unauthenticated POST from anything that could reach the pod, and a rebuild
// replays the whole topic from the oldest offset.
//
// The send is non-blocking on purpose. The channel holds one slot, so a second request while a
// rebuild is queued gets 409 rather than piling up replays of the entire history.
func adminRebuildHandler(adminToken string, rebuildCh chan bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
			fmt.Fprint(w, `{"status":"rebuild_queued"}`)
		default:
			http.Error(w, "rebuild already in progress", http.StatusConflict)
		}
	})
}

// livenessHandler serves the endpoint the Kubernetes probe calls (see defaultHTTPPort).
func livenessHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"ok"}`)
	})
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
