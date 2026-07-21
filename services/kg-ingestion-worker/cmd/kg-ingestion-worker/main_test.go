package main

import "testing"

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
