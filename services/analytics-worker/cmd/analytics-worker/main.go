// Construction OS — Analytics Worker
// Phase 15: OpenTelemetry — OTLP trace exporter, W3C propagation, Kafka header injection.
// Source: context/00_master_construction_os.md §Phase 15
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	cosOtel "github.com/construction-os/analytics-worker/internal/otel"
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

	http.HandleFunc("/health/live", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","service":"analytics-worker"}`)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8091"
	}

	go func() {
		log.Printf("analytics-worker listening on :%s", port)
		if err := http.ListenAndServe(":"+port, nil); err != nil {
			log.Fatalf("http server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("analytics-worker shutting down")
	cancel()
}
