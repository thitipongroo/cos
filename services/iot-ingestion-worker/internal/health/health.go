// Package health serves the liveness endpoint the Kubernetes probe calls.
//
// The worker's real work is an MQTT subscribe loop with no HTTP surface, so without this there is
// nothing for a probe to talk to and Kubernetes cannot tell a wedged pod from a healthy one.
// Mirrors services/analytics-worker (GET /health/live -> {"status":"ok","service":...}).
//
// PORT DEFAULT: 8080, matching the containerPort the Helm charts declare. analytics-worker defaults
// to 8091 while its chart probes 8080 and never sets PORT — a mismatch that fails the liveness probe
// on a real cluster. Keeping the code default equal to the chart's port removes that failure mode
// even if PORT is somehow not injected.
package health

import (
	"fmt"
	"net/http"
	"os"
)

// DefaultPort is used when PORT is unset or empty.
const DefaultPort = "8080"

// Handler returns the mux serving GET /health/live for the named service.
func Handler(service string) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/health/live", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","service":%q}`, service)
	})
	return mux
}

// Port resolves the listen port from the environment, falling back to DefaultPort.
func Port() string {
	if p := os.Getenv("PORT"); p != "" {
		return p
	}
	return DefaultPort
}
