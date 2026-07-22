package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func scrape(t *testing.T) string {
	t.Helper()
	rec := httptest.NewRecorder()
	Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /metrics = %d, want 200", rec.Code)
	}
	return rec.Body.String()
}

// The names and label sets must match packages/@cos/shared/src/kafka/metrics.ts, or the shared
// Grafana panels and the alert rules silently skip this worker.
func TestExposesTheSharedKafkaMetricNames(t *testing.T) {
	MessagesConsumed.WithLabelValues("t.a.b.v1", "svc.shared", "a.b.v1").Inc()
	MessagesProduced.WithLabelValues("t.dlq", "dlq").Inc()

	body := scrape(t)
	for _, want := range []string{
		`kafka_messages_consumed_total{consumer_group="svc.shared",event_type="a.b.v1",topic="t.a.b.v1"} 1`,
		`kafka_messages_produced_total{event_type="dlq",topic="t.dlq"} 1`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("scrape does not contain:\n  %s\ngot:\n%s", want, body)
		}
	}
}

// An idle worker must still return data, or a scrape proves nothing and every panel is blank.
func TestIdleScrapeIsNotEmpty(t *testing.T) {
	body := scrape(t)
	if len(body) == 0 {
		t.Fatal("scrape body is empty — the target would be UP but carry no data")
	}
	if !strings.Contains(body, "go_goroutines") {
		t.Errorf("runtime collectors are not registered; scrape:\n%s", body[:min(len(body), 400)])
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func TestPortDefaultsToTheScrapedPort(t *testing.T) {
	t.Setenv("PROMETHEUS_PORT", "")
	if got := Port(); got != DefaultPort {
		t.Errorf("Port() = %q, want %q", got, DefaultPort)
	}
	// prometheus.yml scrapes :9464 and the Helm chart declares that containerPort.
	if DefaultPort != "9464" {
		t.Errorf("DefaultPort = %q, but prometheus.yml scrapes 9464", DefaultPort)
	}
}

func TestPortReadsEnv(t *testing.T) {
	t.Setenv("PROMETHEUS_PORT", "9999")
	if got := Port(); got != "9999" {
		t.Errorf("Port() = %q, want 9999", got)
	}
}
