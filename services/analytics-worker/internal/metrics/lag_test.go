package metrics

import (
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
)

func at(s string) time.Time {
	ts, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return ts
}

func TestLagSeconds_MeasuresTheDistanceFromOccurredAt(t *testing.T) {
	got, ok := lagSeconds("2026-08-29T10:00:00Z", at("2026-08-29T10:07:30Z"))
	if !ok || got != 450 {
		t.Fatalf("want 450s, got %v (ok=%v)", got, ok)
	}
}

func TestLagSeconds_ClampsNegativeSkewToZeroRatherThanRecordingIt(t *testing.T) {
	// A producer whose clock runs ahead yields a negative sample. Observing it makes
	// histogram_quantile return nonsense and the freshness alert goes QUIET — the one outcome a
	// clock problem must never produce. Skew shows up instead as a floor of zero-lag samples.
	got, ok := lagSeconds("2026-08-29T10:05:00Z", at("2026-08-29T10:00:00Z"))
	if !ok || got != 0 {
		t.Fatalf("want clamp to 0, got %v (ok=%v)", got, ok)
	}
}

func TestLagSeconds_RefusesAnUnparseableTimestamp(t *testing.T) {
	// Reporting a wrong lag is worse than reporting none: the alert would fire or stay silent on a
	// number that means nothing. The bad timestamp is already the event's own problem, handled where
	// eventDate parses it.
	if _, ok := lagSeconds("not-a-timestamp", time.Now()); ok {
		t.Fatal("an unparseable occurred_at must not be observed")
	}
}

func TestLagSeconds_HandlesAnOffsetTimestampNotJustZulu(t *testing.T) {
	// RFC 3339 permits a numeric offset. Treating "+07:00" as UTC would understate lag by 7 hours
	// for any producer that stamps local time — and Bangkok is exactly that offset.
	got, ok := lagSeconds("2026-08-29T17:00:00+07:00", at("2026-08-29T10:01:00Z"))
	if !ok || got != 60 {
		t.Fatalf("want 60s across the offset, got %v (ok=%v)", got, ok)
	}
}

func TestObserveLag_RecordsOneSampleUnderTheEventTypeLabel(t *testing.T) {
	IngestionLag.Reset()
	observeLag("construction.project.created.v1", "2026-08-29T10:00:00Z", at("2026-08-29T10:00:20Z"))

	m := &dto.Metric{}
	h, err := IngestionLag.GetMetricWithLabelValues("construction.project.created.v1")
	if err != nil {
		t.Fatal(err)
	}
	if err := h.(prometheus.Metric).Write(m); err != nil {
		t.Fatal(err)
	}
	if m.GetHistogram().GetSampleCount() != 1 {
		t.Fatalf("want 1 sample, got %d", m.GetHistogram().GetSampleCount())
	}
	if m.GetHistogram().GetSampleSum() != 20 {
		t.Fatalf("want 20s, got %v", m.GetHistogram().GetSampleSum())
	}
}

func TestObserveLag_RecordsNothingForABadTimestamp(t *testing.T) {
	IngestionLag.Reset()
	observeLag("construction.project.created.v1", "garbage", time.Now())

	m := &dto.Metric{}
	h, _ := IngestionLag.GetMetricWithLabelValues("construction.project.created.v1")
	_ = h.(prometheus.Metric).Write(m)
	if m.GetHistogram().GetSampleCount() != 0 {
		t.Fatalf("want no sample, got %d", m.GetHistogram().GetSampleCount())
	}
}

func TestIngestionLag_HasBucketsAtBothBudgets(t *testing.T) {
	// master:4290-4291 sets 30 seconds and 15 minutes. histogram_quantile INTERPOLATES between
	// bucket boundaries, so without an exact boundary at each budget the alert compares its
	// threshold against a number Prometheus made up. This is the assertion that makes the two
	// alert rules mean what they say.
	IngestionLag.Reset()
	observeLag("t", "2026-08-29T10:00:00Z", at("2026-08-29T10:00:01Z"))

	m := &dto.Metric{}
	h, _ := IngestionLag.GetMetricWithLabelValues("t")
	_ = h.(prometheus.Metric).Write(m)

	bounds := map[float64]bool{}
	for _, b := range m.GetHistogram().GetBucket() {
		bounds[b.GetUpperBound()] = true
	}
	for _, want := range []float64{30, 900} {
		if !bounds[want] {
			t.Fatalf("histogram has no bucket boundary at %vs; the alert threshold would be interpolated", want)
		}
	}
}
