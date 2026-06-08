// Construction OS — KG Ingestion Worker
// Phase 13: Knowledge Graph — Kafka consumer + Neo4j writer + admin rebuild endpoint.
// Phase 15: OpenTelemetry — OTLP trace exporter, W3C propagation, Kafka header injection.
// Source: context/00_master_construction_os.md §Phase 13, §Phase 15
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"

	"github.com/construction-os/kg-ingestion-worker/internal/consumer"
	"github.com/construction-os/kg-ingestion-worker/internal/graph"
	cosOtel "github.com/construction-os/kg-ingestion-worker/internal/otel"
	neo4j "github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	otelShutdown, err := cosOtel.Configure(ctx)
	if err != nil {
		log.Printf("otel init warning (non-fatal): %v", err)
	} else {
		defer func() { _ = otelShutdown(context.Background()) }()
	}

	neo4jURI := getEnv("NEO4J_URI", "bolt://localhost:7687")
	neo4jUser := getEnv("NEO4J_USERNAME", "neo4j")
	neo4jPass := getEnv("NEO4J_PASSWORD", "")
	kafkaBrokers := strings.Split(getEnv("KAFKA_BROKERS", "localhost:9092"), ",")
	port := getEnv("PORT", "8090")

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
			if err := consumer.StartConsumerGroupWithRegex(ctx, kafkaBrokers, driver, resetOffset); err != nil {
				if ctx.Err() == nil {
					log.Printf("consumer exited: %v", err)
				}
			}
		}()
	}

	startConsumer(false)

	// admin rebuild handler — POST /admin/rebuild
	// replays all events from the beginning per spec §Phase 13 Full rebuild
	http.HandleFunc("/admin/rebuild", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
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

	go func() {
		log.Printf("kg-ingestion-worker listening on :%s", port)
		if err := http.ListenAndServe(":"+port, nil); err != nil {
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

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
