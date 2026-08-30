package metrics

import (
	"regexp"
	"testing"
)

// The topics the platform actually creates: {tenant_id}.{event_type}, event_type ending in .v1
// (packages/@cos/shared/src/kafka/topic-catalog.ts, topicForEvent).
const tenant = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"

func TestTopicRegexMatchesEveryRealTopic(t *testing.T) {
	// This is the whole point of the rewrite. The ClickHouse Kafka engine tables subscribed to bare
	// names like "construction.project.created" — no tenant prefix, no version — so they matched
	// nothing and the aggregate tables stayed empty while every dashboard answered 200 with zeros.
	re := regexp.MustCompile(TopicRegex)
	events := []string{
		"construction.project.created.v1",
		"procurement.po.created.v1",
		"procurement.rfq.created.v1",
		"procurement.vendor_invoice.approved.v1",
		"site.report.submitted.v1",
		"site.issue.created.v1",
		"site.inspection.failed.v1",
		"workforce.checkin.created.v1",
	}
	for _, event := range events {
		topic := tenant + "." + event
		if !re.MatchString(topic) {
			t.Errorf("regex does not match a real topic: %s", topic)
		}
	}
}

func TestTopicRegexRejectsTopicsItMustNotConsume(t *testing.T) {
	re := regexp.MustCompile(TopicRegex)
	cases := map[string]string{
		"bare event name (the old, broken form)":  "construction.project.created",
		"missing the version suffix":              tenant + ".construction.project.created",
		"a later version with a different shape":  tenant + ".construction.project.created.v2",
		"another domain entirely":                 tenant + ".finance.payment.processed.v1",
		"an event this worker does not aggregate": tenant + ".construction.project.archived.v1",
		"carbon, which the other consumer owns":   tenant + ".carbon.record.created.v1",
	}
	for name, topic := range cases {
		if re.MatchString(topic) {
			t.Errorf("regex should not match %s: %s", name, topic)
		}
	}
}

func TestEventDateTakesTheCalendarDay(t *testing.T) {
	// ClickHouse cannot cast an RFC 3339 string with a trailing Z into Date, and the tables are
	// partitioned by toYYYYMM(event_date) — a bad value lands in the wrong partition rather than
	// failing outright.
	day, err := eventDate("2026-08-23T14:35:07Z")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if day != "2026-08-23" {
		t.Errorf("expected 2026-08-23, got %s", day)
	}
}

func TestEventDateNormalisesToUTC(t *testing.T) {
	// 01:30 on the 24th in Bangkok (+07:00) is still the 23rd in UTC. Aggregates are keyed on one
	// timeline; letting the producer's offset decide would put two events from the same moment in
	// different daily buckets.
	day, err := eventDate("2026-08-24T01:30:00+07:00")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if day != "2026-08-23" {
		t.Errorf("expected 2026-08-23 (UTC), got %s", day)
	}
}

func TestEventDateRejectsAnUnparseableTimestamp(t *testing.T) {
	if _, err := eventDate("not a timestamp"); err == nil {
		t.Error("expected an error rather than a silently wrong partition")
	}
}

func TestProcurementCountsOnlyTheOwningColumn(t *testing.T) {
	// countStateIf(1 = 0) is an EMPTY partial state. Without it a single PO would be counted as a
	// PO, an RFQ and an invoice at once, because every column of the row is written on every insert.
	exprs := procurementCountExprs("po_count", false)
	want := []string{
		"countState()",
		"countStateIf(1 = 0)",
		"countStateIf(1 = 0)",
		"countStateIf(1 = 0)",
	}
	assertExprs(t, exprs, want)
}

func TestProcurementInvoiceCanCountTwiceWhenOverdue(t *testing.T) {
	// An approved invoice already past its payment_due counts in BOTH invoice_count and
	// overdue_invoice_count — they are different questions about the same invoice, not alternatives.
	exprs := procurementCountExprs("invoice_count", true)
	want := []string{
		"countStateIf(1 = 0)",
		"countStateIf(1 = 0)",
		"countState()",
		"countState()",
	}
	assertExprs(t, exprs, want)
}

func TestProcurementInvoiceNotOverdueLeavesTheOverdueColumnEmpty(t *testing.T) {
	exprs := procurementCountExprs("invoice_count", false)
	if exprs[3] != "countStateIf(1 = 0)" {
		t.Errorf("an on-time invoice must not raise overdue_invoice_count, got %s", exprs[3])
	}
}

func TestSiteCountsMixesCountAndSumCorrectly(t *testing.T) {
	// site_activity_daily has two count columns and two sum columns. "Contribute nothing" is spelled
	// differently for each: an empty count state, versus adding zero.
	exprs := siteCountExprs("report_count")
	want := []string{
		"countState()",
		"sumState(toInt32(0))",
		"countStateIf(1 = 0)",
		"sumState(toInt32(0))",
	}
	assertExprs(t, exprs, want)
}

func TestSiteSumColumnsAddOneForTheirOwnEvent(t *testing.T) {
	// One issue raised, one worker checked in: +1 on the running total.
	for _, owned := range []string{"issue_open_count", "manpower_total"} {
		exprs := siteCountExprs(owned)
		idx := map[string]int{"issue_open_count": 1, "manpower_total": 3}[owned]
		if exprs[idx] != "sumState(toInt32(1))" {
			t.Errorf("%s should add 1, got %s", owned, exprs[idx])
		}
	}
}

func TestSiteInspectionFailureIsCountedNotSummed(t *testing.T) {
	exprs := siteCountExprs("inspection_fail_count")
	if exprs[2] != "countState()" {
		t.Errorf("inspection_fail_count is a count, got %s", exprs[2])
	}
	if exprs[0] != "countStateIf(1 = 0)" {
		t.Errorf("a failed inspection is not a site report, got %s", exprs[0])
	}
}

func assertExprs(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("expected %d expressions, got %d", len(want), len(got))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("column %d: expected %s, got %s", i, want[i], got[i])
		}
	}
}
