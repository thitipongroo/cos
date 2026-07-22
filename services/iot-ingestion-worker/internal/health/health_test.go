package health

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandlerServesLiveness(t *testing.T) {
	rec := httptest.NewRecorder()
	Handler("iot-ingestion-worker").ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health/live", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /health/live = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}

	var body struct {
		Status  string `json:"status"`
		Service string `json:"service"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body is not valid JSON (%v): %s", err, rec.Body.String())
	}
	if body.Status != "ok" || body.Service != "iot-ingestion-worker" {
		t.Errorf("body = %+v, want {ok iot-ingestion-worker}", body)
	}
}

// The probe path is the one the Helm chart declares. A rename here silently breaks the liveness
// probe on a real cluster (ADR-039: lint and dry-run do not catch it).
func TestHandlerDoesNotServeOtherPaths(t *testing.T) {
	rec := httptest.NewRecorder()
	Handler("iot-ingestion-worker").ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Code != http.StatusNotFound {
		t.Errorf("GET /healthz = %d, want 404 (only /health/live is served)", rec.Code)
	}
}

func TestPortDefaultsToChartContainerPort(t *testing.T) {
	t.Setenv("PORT", "")
	if got := Port(); got != DefaultPort {
		t.Errorf("Port() = %q, want %q", got, DefaultPort)
	}
	if DefaultPort != "8080" {
		t.Errorf("DefaultPort = %q, but the Helm chart declares containerPort 8080", DefaultPort)
	}
}

func TestPortReadsEnv(t *testing.T) {
	t.Setenv("PORT", "9099")
	if got := Port(); got != "9099" {
		t.Errorf("Port() = %q, want 9099", got)
	}
}
