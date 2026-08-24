package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestHealthHandlerServesLiveness(t *testing.T) {
	rec := httptest.NewRecorder()
	healthHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health/live", nil))

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
	if body.Status != "ok" || body.Service != "analytics-worker" {
		t.Errorf("body = %+v, want {ok analytics-worker}", body)
	}
}

func TestHealthHandlerDoesNotServeOtherPaths(t *testing.T) {
	rec := httptest.NewRecorder()
	healthHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Code != http.StatusNotFound {
		t.Errorf("GET /healthz = %d, want 404 (only /health/live is served)", rec.Code)
	}
}

func TestPortResolution(t *testing.T) {
	t.Run("falls back to the deployed default", func(t *testing.T) {
		t.Setenv("PORT", "")
		if got := getEnv("PORT", defaultHTTPPort); got != defaultHTTPPort {
			t.Errorf("port = %q, want %q", got, defaultHTTPPort)
		}
	})
	t.Run("honours PORT", func(t *testing.T) {
		t.Setenv("PORT", "9099")
		if got := getEnv("PORT", defaultHTTPPort); got != "9099" {
			t.Errorf("port = %q, want 9099", got)
		}
	})
}

// ─── the regression guards ───────────────────────────────────────────────────
// The bug this replaces: the Helm chart probed httpGet /health/live on a port the binary was not
// listening on, and nothing in CI could see it. These tests read the deployment artifacts and fail
// if the code default and the deployed port ever drift apart again.

func repoFile(t *testing.T, rel string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", rel))
	if err != nil {
		t.Fatalf("read %s: %v", rel, err)
	}
	return string(b)
}

func TestDockerfileExposesTheDefaultPort(t *testing.T) {
	if !strings.Contains(repoFile(t, "Dockerfile"), "EXPOSE "+defaultHTTPPort) {
		t.Errorf("Dockerfile does not EXPOSE %s — the image and the binary disagree", defaultHTTPPort)
	}
}

// The Helm chart lives outside the Go module, so it is read by path. If the chart is ever moved this
// test fails loudly rather than silently passing.
func TestHelmChartProbesTheDefaultPort(t *testing.T) {
	values := filepath.Join("..", "..", "..", "..", "infrastructure", "helm", "cos-analytics-worker", "values.yaml")
	b, err := os.ReadFile(values)
	if err != nil {
		t.Fatalf("read chart values (%s): %v", values, err)
	}
	s := string(b)

	// Every `port:` under a probe must be the port the binary listens on.
	for _, m := range regexp.MustCompile(`(?m)^\s+port:\s*(\d+)`).FindAllStringSubmatch(s, -1) {
		if m[1] != defaultHTTPPort {
			t.Errorf("chart declares port %s but the binary defaults to %s", m[1], defaultHTTPPort)
		}
	}
	// ...and the chart must pin PORT explicitly, so the probe cannot depend on the code default.
	if !strings.Contains(s, "PORT: '"+defaultHTTPPort+"'") {
		t.Errorf("chart does not set PORT: '%s' — probe port and listen port can drift", defaultHTTPPort)
	}
}
