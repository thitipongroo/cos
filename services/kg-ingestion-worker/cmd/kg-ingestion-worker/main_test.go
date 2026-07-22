package main

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func repoFile(t *testing.T, rel string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", rel))
	if err != nil {
		t.Fatalf("read %s: %v", rel, err)
	}
	return string(b)
}

func chartValues(t *testing.T) string {
	t.Helper()
	p := filepath.Join("..", "..", "..", "..", "infrastructure", "helm", "cos-kg-ingestion-worker", "values.yaml")
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read chart values (%s): %v", p, err)
	}
	return string(b)
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

func TestDockerfileExposesTheDefaultPort(t *testing.T) {
	if !strings.Contains(repoFile(t, "Dockerfile"), "EXPOSE "+defaultHTTPPort) {
		t.Errorf("Dockerfile does not EXPOSE %s — the image and the binary disagree", defaultHTTPPort)
	}
}

func TestHelmChartProbesTheDefaultPort(t *testing.T) {
	s := chartValues(t)
	for _, m := range regexp.MustCompile(`(?m)^\s+port:\s*(\d+)`).FindAllStringSubmatch(s, -1) {
		if m[1] != defaultHTTPPort {
			t.Errorf("chart declares port %s but the binary defaults to %s", m[1], defaultHTTPPort)
		}
	}
	if !strings.Contains(s, "PORT: '"+defaultHTTPPort+"'") {
		t.Errorf("chart does not set PORT: '%s' — probe port and listen port can drift", defaultHTTPPort)
	}
}

// The specific bug this replaces: the chart ran `pgrep kg-ingestion-worker`, but the Dockerfile
// builds the binary as `worker`, so pgrep never matched and both probes failed permanently. Any
// future exec probe must name a process the Dockerfile actually produces.
func TestHelmChartExecProbeNamesARealProcess(t *testing.T) {
	values := chartValues(t)
	dockerfile := repoFile(t, "Dockerfile")

	// Binary name from `go build -o <name>`.
	m := regexp.MustCompile(`go build[^\n]*-o\s+(\S+)`).FindStringSubmatch(dockerfile)
	if m == nil {
		t.Fatal("could not determine the built binary name from the Dockerfile")
	}
	binary := m[1]

	for _, pg := range regexp.MustCompile(`pgrep\s+(\S+?)['"\]]`).FindAllStringSubmatch(values, -1) {
		if pg[1] != binary {
			t.Errorf("chart probes `pgrep %s` but the Dockerfile builds %q — the probe can never match",
				pg[1], binary)
		}
	}
}

// The chart probes an HTTP path; main.go must actually register it.
func TestHelmChartProbesPathsTheServiceServes(t *testing.T) {
	values := chartValues(t)
	main, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read main.go: %v", err)
	}
	for _, m := range regexp.MustCompile(`path:\s*(/\S+)`).FindAllStringSubmatch(values, -1) {
		if !strings.Contains(string(main), `"`+m[1]+`"`) {
			t.Errorf("chart probes %s but main.go does not register that path", m[1])
		}
	}
}

// POST /admin/rebuild replays the whole topic from the oldest offset. Before this guard it took an
// unauthenticated request from anything that could reach the pod: spec §5.4 relies on Istio mTLS,
// but no Istio manifest exists in infrastructure/, and the repository's only NetworkPolicy selects
// a label (`cos.io/cloudflare-protected`) that no chart sets, so there is no default-deny either.
func TestAdminAuthorized(t *testing.T) {
	cases := []struct {
		name     string
		expected string
		header   string
		want     bool
	}{
		{"accepts the configured token", "s3cret", "Bearer s3cret", true},
		{"rejects a wrong token", "s3cret", "Bearer nope", false},
		{"rejects a missing header", "s3cret", "", false},
		{"rejects a bare token with no scheme", "s3cret", "s3cret", false},
		{"rejects the wrong scheme", "s3cret", "Basic s3cret", false},
		{"is case-sensitive about the scheme", "s3cret", "bearer s3cret", false},
		{"rejects a token that is only a prefix", "s3cret", "Bearer s3c", false},
		{"rejects a token with trailing data", "s3cret", "Bearer s3cretX", false},
		// Fail-closed. An unset KG_ADMIN_TOKEN must disable the endpoint, never open it — including
		// against a request that helpfully sends an empty bearer token.
		{"unset token authorises nothing", "", "Bearer s3cret", false},
		{"unset token rejects an empty bearer", "", "Bearer ", false},
		{"unset token rejects a missing header", "", "", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := adminAuthorized(tc.expected, tc.header); got != tc.want {
				t.Errorf("adminAuthorized(%q, %q) = %v, want %v", tc.expected, tc.header, got, tc.want)
			}
		})
	}
}
