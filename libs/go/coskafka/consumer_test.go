package coskafka

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"

	"github.com/twmb/franz-go/pkg/kgo"
)

func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// msgFor wraps the golden fixture with a tenant_id header, which is what a correctly-routed
// message looks like. The golden envelope's tenant_id is the all-1s UUID.
const goldenTenant = "11111111-1111-1111-1111-111111111111"

func msgFor(t *testing.T, headerTenant string) *kgo.Record {
	t.Helper()
	record := &kgo.Record{
		Topic: goldenTenant + ".carbon.record.created.v1",
		Value: goldenBytes(t),
	}
	if headerTenant != "" {
		record.Headers = []kgo.RecordHeader{
			{Key: "tenant_id", Value: []byte(headerTenant)},
		}
	}
	return record
}

func TestHandle_TenantGuard(t *testing.T) {
	url := registryURL(t) // skips when no registry is running

	t.Run("processes a message whose header matches the envelope", func(t *testing.T) {
		called := false
		c := NewConsumer(NewDecoder(url), nil, nil,
			func(_ context.Context, e *EventEnvelope) error {
				called = true
				if e.TenantID != goldenTenant {
					t.Errorf("handler saw tenant_id %q", e.TenantID)
				}
				return nil
			}, quietLogger())

		c.Handle(context.Background(), msgFor(t, goldenTenant))

		if !called {
			t.Error("handler was not called for a correctly-routed message")
		}
	})

	// §7.3 — the guard exists so one tenant's data can never be processed under another's routing.
	t.Run("refuses a message whose header names a different tenant", func(t *testing.T) {
		called := false
		c := NewConsumer(NewDecoder(url), nil, nil,
			func(context.Context, *EventEnvelope) error { called = true; return nil },
			quietLogger())

		c.Handle(context.Background(), msgFor(t, "99999999-9999-9999-9999-999999999999"))

		if called {
			t.Error("handler ran on a tenant_id mismatch — §7.3 isolation guard is not enforced")
		}
	})

	t.Run("refuses a message with no tenant_id header at all", func(t *testing.T) {
		called := false
		c := NewConsumer(NewDecoder(url), nil, nil,
			func(context.Context, *EventEnvelope) error { called = true; return nil },
			quietLogger())

		c.Handle(context.Background(), msgFor(t, ""))

		if called {
			t.Error("handler ran without a tenant_id header")
		}
	})
}

func TestHandle_UndecodableMessageDoesNotReachHandler(t *testing.T) {
	called := false
	c := NewConsumer(NewDecoder("http://localhost:8081"), nil, nil,
		func(context.Context, *EventEnvelope) error { called = true; return nil },
		quietLogger())

	c.Handle(context.Background(), &kgo.Record{
		Topic: goldenTenant + ".carbon.record.created.v1",
		Value: []byte(`{"event_type":"carbon.record.created.v1"}`), // raw JSON — the original defect
	})

	if called {
		t.Error("handler ran on unframed JSON")
	}
}

func TestHandle_RetriesThenGivesUp(t *testing.T) {
	url := registryURL(t)

	attempts := 0
	c := NewConsumer(NewDecoder(url), nil, nil,
		func(context.Context, *EventEnvelope) error {
			attempts++
			return errors.New("downstream unavailable")
		}, quietLogger())

	// Cancelled context: the handler still runs, but the backoff select exits immediately instead
	// of sleeping 1s + 5s, so the test does not pay the real retry delays.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	c.Handle(ctx, msgFor(t, goldenTenant))

	if attempts == 0 {
		t.Fatal("handler was never called")
	}
	if attempts > maxRetries {
		t.Errorf("handler called %d times, more than maxRetries=%d", attempts, maxRetries)
	}
}

func TestDLQTopicFor(t *testing.T) {
	for _, tc := range []struct{ name, in, want string }{
		{"tenant-scoped topic", "tenant-a.carbon.record.created.v1", "tenant-a.dlq"},
		// Every domain of a tenant lands in that tenant's single DLQ.
		{"another domain, same tenant DLQ", "tenant-a.site.issue.created.v1", "tenant-a.dlq"},
		{"a different tenant never shares it", "tenant-b.site.issue.created.v1", "tenant-b.dlq"},
		{"platform events topic", "platform.events", "platform.dlq"},
		{"platform-prefixed topic", "platform.enterprise.contract_signed.v1", "platform.dlq"},
		{"unsplittable topic falls back to the platform DLQ", "weird", "platform.dlq"},
	} {
		if got := DLQTopicFor(tc.in); got != tc.want {
			t.Errorf("%s: DLQTopicFor(%q) = %q, want %q", tc.name, tc.in, got, tc.want)
		}
	}
}

func TestHeaderValue(t *testing.T) {
	headers := []kgo.RecordHeader{
		{Key: "other", Value: []byte("x")},
		{Key: "tenant_id", Value: []byte("t1")},
	}
	if got := headerValue(headers, "tenant_id"); got != "t1" {
		t.Errorf("headerValue = %q, want \"t1\"", got)
	}
	if got := headerValue(headers, "absent"); got != "" {
		t.Errorf("missing header returned %q, want empty string", got)
	}
}
