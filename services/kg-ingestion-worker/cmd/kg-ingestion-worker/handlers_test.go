// Tests for the worker's HTTP surface.
//
// §35.13 ESC-45: both handlers lived in closures inside main(), so nothing could reach them — the
// admin rebuild endpoint in particular, whose whole job is to refuse requests it should refuse.
// A rebuild replays the entire topic from the oldest offset, so every one of these refusals is the
// difference between an authorised operation and anything that can reach the pod triggering a full
// re-consume.

package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func post(t *testing.T, h http.Handler, auth string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/admin/rebuild", nil)
	if auth != "" {
		req.Header.Set("Authorization", auth)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

// ─── /admin/rebuild ──────────────────────────────────────────────────────────

func TestAdminRebuild_QueuesTheRebuildForAnAuthorisedPost(t *testing.T) {
	ch := make(chan bool, 1)
	rec := post(t, adminRebuildHandler("s3cret", ch), "Bearer s3cret")

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202", rec.Code)
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body is not JSON (%v): %s", err, rec.Body.String())
	}
	if body.Status != "rebuild_queued" {
		t.Errorf("status = %q", body.Status)
	}
	select {
	case v := <-ch:
		if !v {
			t.Error("the rebuild signal was false")
		}
	default:
		t.Error("nothing was queued — the endpoint answered 202 without asking for a rebuild")
	}
}

func TestAdminRebuild_RefusesEveryRequestWhenNoTokenIsConfigured(t *testing.T) {
	// Fail-closed is the point: an unset KG_ADMIN_TOKEN must not mean "no authentication required".
	// There is no default-deny behind this — spec §5.4 leans on Istio mTLS, but no Istio manifest
	// exists in infrastructure/, and the only NetworkPolicy selects a label no chart sets.
	ch := make(chan bool, 1)
	h := adminRebuildHandler("", ch)

	for _, auth := range []string{"", "Bearer ", "Bearer anything"} {
		rec := post(t, h, auth)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("auth %q → %d, want 401", auth, rec.Code)
		}
	}
	if len(ch) != 0 {
		t.Error("a rebuild was queued while the endpoint was unconfigured")
	}
}

func TestAdminRebuild_RejectsAWrongToken(t *testing.T) {
	ch := make(chan bool, 1)
	rec := post(t, adminRebuildHandler("s3cret", ch), "Bearer wrong")

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
	if len(ch) != 0 {
		t.Error("a rebuild was queued for an unauthorised caller")
	}
}

func TestAdminRebuild_RejectsANonPostMethod(t *testing.T) {
	// A rebuild is not idempotent from the operator's point of view — it restarts consumption of the
	// whole topic — so it must not be reachable by a GET a browser or a health checker might make.
	ch := make(chan bool, 1)
	h := adminRebuildHandler("s3cret", ch)

	for _, method := range []string{http.MethodGet, http.MethodPut, http.MethodDelete} {
		req := httptest.NewRequest(method, "/admin/rebuild", nil)
		req.Header.Set("Authorization", "Bearer s3cret")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s → %d, want 405", method, rec.Code)
		}
	}
	if len(ch) != 0 {
		t.Error("a rebuild was queued by a non-POST request")
	}
}

func TestAdminRebuild_AnswersConflictWhenOneIsAlreadyQueued(t *testing.T) {
	// The channel holds one slot and the send is non-blocking, so a second request cannot pile up
	// another full replay behind the first — it is told the rebuild is already running.
	ch := make(chan bool, 1)
	h := adminRebuildHandler("s3cret", ch)

	if rec := post(t, h, "Bearer s3cret"); rec.Code != http.StatusAccepted {
		t.Fatalf("first request = %d, want 202", rec.Code)
	}
	if rec := post(t, h, "Bearer s3cret"); rec.Code != http.StatusConflict {
		t.Errorf("second request = %d, want 409", rec.Code)
	}
}

// ─── /health/live ────────────────────────────────────────────────────────────

func TestLivenessHandler_AnswersOKAsJSON(t *testing.T) {
	rec := httptest.NewRecorder()
	livenessHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health/live", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body is not JSON (%v): %s", err, rec.Body.String())
	}
	if body.Status != "ok" {
		t.Errorf("status = %q", body.Status)
	}
}

// ─── the liveness port ───────────────────────────────────────────────────────

func TestDefaultHTTPPortMatchesTheDeployedPort(t *testing.T) {
	// The chart used to probe `pgrep kg-ingestion-worker` while the Dockerfile builds the binary as
	// `worker`, so both probes exited 1 and the pod could only CrashLoopBackOff. The probe now calls
	// GET /health/live on this port; pinning the value here is what keeps the two in step.
	if defaultHTTPPort != "8090" {
		t.Errorf("defaultHTTPPort = %q, want 8090 (Dockerfile EXPOSE / chart probe port)", defaultHTTPPort)
	}
	t.Setenv("PORT", "")
	if got := getEnv("PORT", defaultHTTPPort); got != "8090" {
		t.Errorf("with PORT unset the worker would listen on %q", got)
	}
}
