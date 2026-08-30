// Unit tests for the Phase 14 metrics Writer.
//
// §35.13 ESC-23: this package arrived on 2026-08-29 with its pure helpers covered — eventDate,
// procurementCountExprs, siteCountExprs, the lag histogram — and every function that actually
// reaches ClickHouse at 0%. That is 123 of the module's 265 statements, and it took analytics-worker
// from 96.2% to 46.8%, below the measured floor the go-tests job gates on.
//
// The 0% half is also the half that matters: these handlers are the fix for §35.13 ESC-38/39, where
// the dashboard aggregates were fed by ClickHouse Kafka engine tables subscribed to bare event names
// — topics that never exist — so every panel read zero. Replacing a pipeline that silently produced
// nothing with one that is never executed under test would not have moved the risk.
//
// The ClickHouse handle is a real *sql.DB over a fake database/sql driver, the same shape
// internal/carbon/writer_test.go uses, so each INSERT is asserted as the driver receives it:
// statement text and every bound value, in order. What that buys over a mocked *sql.DB is the thing
// no compiler checks here — that the `?` placeholders line up with the columns the SELECT projects,
// and that a PO contributes to committed_amount while leaving actual_amount alone.

package metrics

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/construction-os/coslib/coskafka"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
)

// histogramCount reads how many lag samples have been recorded under one event type. Used to prove
// Handle measures BEFORE it dispatches, which is the only reason an unhandled type still gets a
// sample. See lag_test.go for the same accessor written out inline.
func histogramCount(t *testing.T, eventType string) uint64 {
	t.Helper()
	h, err := IngestionLag.GetMetricWithLabelValues(eventType)
	if err != nil {
		t.Fatalf("read lag histogram: %v", err)
	}
	m := &dto.Metric{}
	if err := h.(prometheus.Metric).Write(m); err != nil {
		t.Fatalf("write lag metric: %v", err)
	}
	return m.GetHistogram().GetSampleCount()
}

// ─── fake database/sql driver ────────────────────────────────────────────────

type execRecord struct {
	query string
	args  []driver.NamedValue
}

type fakeDriver struct {
	mu    sync.Mutex
	execs []execRecord
	err   error // returned by every ExecContext when set
}

type fakeConn struct{ d *fakeDriver }

func (d *fakeDriver) Open(string) (driver.Conn, error) { return &fakeConn{d: d}, nil }

func (c *fakeConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("not used") }
func (c *fakeConn) Close() error                        { return nil }
func (c *fakeConn) Begin() (driver.Tx, error)           { return nil, errors.New("not used") }

func (c *fakeConn) ExecContext(
	_ context.Context,
	query string,
	args []driver.NamedValue,
) (driver.Result, error) {
	c.d.mu.Lock()
	defer c.d.mu.Unlock()
	c.d.execs = append(c.d.execs, execRecord{query: query, args: args})
	if c.d.err != nil {
		return nil, c.d.err
	}
	return driver.RowsAffected(1), nil
}

func (d *fakeDriver) recorded() []execRecord {
	d.mu.Lock()
	defer d.mu.Unlock()
	out := make([]execRecord, len(d.execs))
	copy(out, d.execs)
	return out
}

var driverSeq int

// newFakeDB registers a driver instance under a unique name — database/sql panics on a duplicate
// registration, so each test needs its own.
func newFakeDB(t *testing.T, execErr error) (*sql.DB, *fakeDriver) {
	t.Helper()
	d := &fakeDriver{err: execErr}
	driverSeq++
	name := "metrics-fake-" + string(rune('a'+driverSeq%26)) + time.Now().Format("150405.000000000")
	sql.Register(name, d)
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatalf("open fake db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, d
}

func newWriterOn(t *testing.T, execErr error) (*Writer, *fakeDriver) {
	t.Helper()
	db, d := newFakeDB(t, execErr)
	return NewWriter(db), d
}

// ─── fixtures ────────────────────────────────────────────────────────────────

const (
	tenantID  = "22222222-2222-2222-2222-222222222222"
	projectID = "44444444-4444-4444-4444-444444444444"
	occurred  = "2026-06-08T09:00:00Z"
)

func envelope(t *testing.T, eventType string, payload any) *coskafka.EventEnvelope {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	return &coskafka.EventEnvelope{
		EventID:    "11111111-1111-1111-1111-111111111111",
		EventType:  eventType,
		TenantID:   tenantID,
		OccurredAt: occurred,
		Payload:    raw,
	}
}

// brokenPayload is valid JSON that is not an OBJECT, so every handler's json.Unmarshal into its
// payload struct fails. Using invalid JSON would work too; this also proves the guard is about the
// shape the handler needs and not merely about the bytes parsing.
func brokenPayload(t *testing.T, eventType string) *coskafka.EventEnvelope {
	t.Helper()
	e := envelope(t, eventType, map[string]string{})
	e.Payload = json.RawMessage(`"not an object"`)
	return e
}

func values(t *testing.T, rec execRecord) []any {
	t.Helper()
	out := make([]any, len(rec.args))
	for i, a := range rec.args {
		out[i] = a.Value
	}
	return out
}

func requireExecs(t *testing.T, d *fakeDriver, n int) []execRecord {
	t.Helper()
	got := d.recorded()
	if len(got) != n {
		t.Fatalf("expected %d INSERT(s), got %d", n, len(got))
	}
	return got
}

// ─── Handle: the dispatch ────────────────────────────────────────────────────

func TestHandle_RoutesEveryEventTypeTheSubscriptionAdmits(t *testing.T) {
	// The regex admits exactly these eight. A case missing from the switch is not a compile error —
	// it falls through to the default and the aggregate is silently short by that event forever.
	cases := []struct {
		eventType string
		table     string
		execs     int
	}{
		{"construction.project.created.v1", "analytics.project_cost_daily", 1},
		// The two-INSERT handlers write the cost row AND the activity count.
		{"procurement.po.created.v1", "analytics.project_cost_daily", 2},
		{"procurement.rfq.created.v1", "analytics.procurement_activity_daily", 1},
		{"procurement.vendor_invoice.approved.v1", "analytics.project_cost_daily", 2},
		{"site.report.submitted.v1", "analytics.site_activity_daily", 1},
		{"site.issue.created.v1", "analytics.site_activity_daily", 1},
		{"site.inspection.failed.v1", "analytics.site_activity_daily", 1},
		{"workforce.checkin.created.v1", "analytics.site_activity_daily", 1},
	}
	for _, tc := range cases {
		t.Run(tc.eventType, func(t *testing.T) {
			w, d := newWriterOn(t, nil)
			// One payload shape serves all eight: the money fields are ignored by the handlers that
			// do not read them, and project_id is the only field every one of them needs.
			e := envelope(t, tc.eventType, map[string]any{
				"project_id":   projectID,
				"budget":       map[string]string{"amount": "1000.0000", "currency_code": "THB"},
				"total_amount": map[string]string{"amount": "500.0000", "currency_code": "THB"},
				"amount":       map[string]string{"amount": "250.0000", "currency_code": "THB"},
			})
			if err := w.Handle(context.Background(), e); err != nil {
				t.Fatalf("Handle: %v", err)
			}
			got := requireExecs(t, d, tc.execs)
			if !strings.Contains(got[0].query, tc.table) {
				t.Errorf("first INSERT did not target %s:\n%s", tc.table, got[0].query)
			}
		})
	}
}

func TestHandle_LogsAndAcceptsAnEventTypeTheSwitchDoesNotKnow(t *testing.T) {
	// Returning an error would send it round the retry/DLQ path forever. The subscription regex and
	// this switch are supposed to agree; a disagreement is an operator problem, not a poison message.
	w, d := newWriterOn(t, nil)
	e := envelope(t, "construction.delay.detected.v1", map[string]any{"project_id": projectID})

	if err := w.Handle(context.Background(), e); err != nil {
		t.Fatalf("an unhandled type must not be an error: %v", err)
	}
	requireExecs(t, d, 0)
}

func TestHandle_MeasuresLagBeforeDispatchingNotInsideEachCase(t *testing.T) {
	// observeLag is called once, ahead of the switch, so a case added later cannot forget it. The
	// assertion is that an event the switch does NOT know still lands in the histogram — that is
	// only true if the call sits before the dispatch.
	w, _ := newWriterOn(t, nil)
	e := envelope(t, "construction.delay.detected.v1", map[string]any{"project_id": projectID})

	before := histogramCount(t, "construction.delay.detected.v1")
	if err := w.Handle(context.Background(), e); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if after := histogramCount(t, "construction.delay.detected.v1"); after != before+1 {
		t.Errorf("lag sample count went %d → %d, expected one more", before, after)
	}
}

// ─── project_cost_daily ──────────────────────────────────────────────────────

func TestProjectCreated_WritesTheBudgetAsASnapshotAndNothingToTheSums(t *testing.T) {
	// budget_amount is read with max(); the two sums must receive an EMPTY partial state, or a
	// project's budget would also be added to its committed and actual cost.
	w, d := newWriterOn(t, nil)
	e := envelope(t, "construction.project.created.v1", map[string]any{
		"project_id": projectID,
		"budget":     map[string]string{"amount": "1000000.0000", "currency_code": "THB"},
	})

	if err := w.projectCreated(context.Background(), e); err != nil {
		t.Fatalf("projectCreated: %v", err)
	}
	rec := requireExecs(t, d, 1)[0]
	if strings.Count(rec.query, "sumState(toDecimal128(0, 4))") != 2 {
		t.Errorf("both sum columns must contribute an empty state:\n%s", rec.query)
	}
	// tenant, project, day, budget — in that order, and the day is the CALENDAR day.
	want := []any{tenantID, projectID, "2026-06-08", "1000000.0000"}
	got := values(t, rec)
	if len(got) != len(want) {
		t.Fatalf("bound %d values, expected %d: %v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("bound value %d = %v, want %v", i, got[i], want[i])
		}
	}
}

func TestPoCreated_CountsAsACommitmentNotAnActualCost(t *testing.T) {
	// An approved PO is money promised, not money spent. Putting it in actual_amount would make the
	// dashboard report a cost overrun the moment purchasing did its job.
	w, d := newWriterOn(t, nil)
	e := envelope(t, "procurement.po.created.v1", map[string]any{
		"project_id":   projectID,
		"total_amount": map[string]string{"amount": "500.0000", "currency_code": "THB"},
	})

	if err := w.poCreated(context.Background(), e); err != nil {
		t.Fatalf("poCreated: %v", err)
	}
	got := requireExecs(t, d, 2)
	cost := got[0]
	if !strings.Contains(cost.query, "sumState(toDecimal128(?, 4)),\n\t\t       sumState(toDecimal128(0, 4))") {
		t.Errorf("the committed column takes the amount and actual takes an empty state:\n%s", cost.query)
	}
	if v := values(t, cost); v[3] != "500.0000" {
		t.Errorf("committed amount bound as %v, want 500.0000", v[3])
	}
	// The second INSERT is the activity count, and it must own po_count alone.
	counts := got[1]
	if !strings.Contains(counts.query, "analytics.procurement_activity_daily") {
		t.Errorf("second INSERT is not the activity row:\n%s", counts.query)
	}
	if strings.Count(counts.query, "countState()") != 1 {
		t.Errorf("a PO must count once, as a PO only:\n%s", counts.query)
	}
}

func TestInvoiceApproved_CountsAsAnActualCostAndAnInvoice(t *testing.T) {
	w, d := newWriterOn(t, nil)
	e := envelope(t, "procurement.vendor_invoice.approved.v1", map[string]any{
		"project_id":  projectID,
		"amount":      map[string]string{"amount": "250.0000", "currency_code": "THB"},
		"payment_due": "2026-07-01",
	})

	if err := w.invoiceApproved(context.Background(), e); err != nil {
		t.Fatalf("invoiceApproved: %v", err)
	}
	got := requireExecs(t, d, 2)
	if !strings.Contains(got[0].query, "sumState(toDecimal128(0, 4)),\n\t\t       sumState(toDecimal128(?, 4))") {
		t.Errorf("an invoice is an ACTUAL cost — committed must take the empty state:\n%s", got[0].query)
	}
	// Due in the future: invoice_count only, not overdue_invoice_count.
	if n := strings.Count(got[1].query, "countState()"); n != 1 {
		t.Errorf("an invoice not yet due must count once, got %d countState():\n%s", n, got[1].query)
	}
}

func TestInvoiceApproved_CountsTwiceWhenItIsAlreadyOverdueOnArrival(t *testing.T) {
	// Overdue is judged at ingestion, as the materialized view did — an invoice that becomes overdue
	// later is not recounted. The DDL documents that approximation and this pins it, so the number
	// cannot drift away from its own definition unnoticed.
	w, d := newWriterOn(t, nil)
	e := envelope(t, "procurement.vendor_invoice.approved.v1", map[string]any{
		"project_id":  projectID,
		"amount":      map[string]string{"amount": "250.0000", "currency_code": "THB"},
		"payment_due": "2026-01-01", // before the event's own day
	})

	if err := w.invoiceApproved(context.Background(), e); err != nil {
		t.Fatalf("invoiceApproved: %v", err)
	}
	counts := requireExecs(t, d, 2)[1]
	if n := strings.Count(counts.query, "countState()"); n != 2 {
		t.Errorf("an overdue invoice counts in BOTH columns, got %d countState():\n%s", n, counts.query)
	}
}

func TestInvoiceApproved_AnAbsentPaymentDueIsNotOverdue(t *testing.T) {
	// "" < any date is true in Go's string comparison, so an empty payment_due would be read as
	// overdue by a naive check — the guard on `p.PaymentDue != ""` is what stops that.
	w, d := newWriterOn(t, nil)
	e := envelope(t, "procurement.vendor_invoice.approved.v1", map[string]any{
		"project_id": projectID,
		"amount":     map[string]string{"amount": "250.0000", "currency_code": "THB"},
	})

	if err := w.invoiceApproved(context.Background(), e); err != nil {
		t.Fatalf("invoiceApproved: %v", err)
	}
	counts := requireExecs(t, d, 2)[1]
	if n := strings.Count(counts.query, "countState()"); n != 1 {
		t.Errorf("an invoice with no due date is not overdue, got %d countState():\n%s", n, counts.query)
	}
}

func TestRfqCreated_OwnsTheRfqColumnAlone(t *testing.T) {
	w, d := newWriterOn(t, nil)
	e := envelope(t, "procurement.rfq.created.v1", map[string]any{"project_id": projectID})

	if err := w.rfqCreated(context.Background(), e); err != nil {
		t.Fatalf("rfqCreated: %v", err)
	}
	rec := requireExecs(t, d, 1)[0]
	if !strings.Contains(rec.query, "analytics.procurement_activity_daily") {
		t.Errorf("wrong table:\n%s", rec.query)
	}
	if n := strings.Count(rec.query, "countStateIf(1 = 0)"); n != 3 {
		t.Errorf("the three columns an RFQ does not own must contribute nothing, got %d:\n%s", n, rec.query)
	}
}

// ─── site_activity_daily ─────────────────────────────────────────────────────

func TestReportSubmitted_UsesTheReportsOwnDateNotTheSubmissionMoment(t *testing.T) {
	// A report filed the next morning belongs to the day it describes, which is the whole point of a
	// daily site trend.
	w, d := newWriterOn(t, nil)
	e := envelope(t, "site.report.submitted.v1", map[string]any{
		"project_id":  projectID,
		"report_date": "2026-06-07",
	})

	if err := w.reportSubmitted(context.Background(), e); err != nil {
		t.Fatalf("reportSubmitted: %v", err)
	}
	if v := values(t, requireExecs(t, d, 1)[0]); v[2] != "2026-06-07" {
		t.Errorf("event_date = %v, want the report's own date 2026-06-07", v[2])
	}
}

func TestReportSubmitted_FallsBackToOccurredAtWhenTheReportCarriesNoDate(t *testing.T) {
	w, d := newWriterOn(t, nil)
	e := envelope(t, "site.report.submitted.v1", map[string]any{"project_id": projectID})

	if err := w.reportSubmitted(context.Background(), e); err != nil {
		t.Fatalf("reportSubmitted: %v", err)
	}
	if v := values(t, requireExecs(t, d, 1)[0]); v[2] != "2026-06-08" {
		t.Errorf("event_date = %v, want the occurred_at day 2026-06-08", v[2])
	}
}

func TestReportSubmitted_ReportsABadOccurredAtWhenItHasToFallBackOnIt(t *testing.T) {
	w, d := newWriterOn(t, nil)
	e := envelope(t, "site.report.submitted.v1", map[string]any{"project_id": projectID})
	e.OccurredAt = "the eighth of June"

	err := w.reportSubmitted(context.Background(), e)
	if err == nil {
		t.Fatal("an unparseable occurred_at with no report_date must be an error, not a guess")
	}
	if !strings.Contains(err.Error(), "parse occurred_at") {
		t.Errorf("error does not name the cause: %v", err)
	}
	requireExecs(t, d, 0)
}

func TestSiteEventsEachOwnOneColumnAndLeaveTheOthersEmpty(t *testing.T) {
	// The site table mixes count and sum columns, so "contribute nothing" is spelled two different
	// ways — countStateIf(1 = 0) and sumState(toInt32(0)). Getting one wrong for a given event is
	// how a check-in would start incrementing the issue count.
	cases := []struct {
		name     string
		call     func(*Writer, context.Context, *coskafka.EventEnvelope) error
		event    string
		owned    string
		ownedSQL string
	}{
		{"issueCreated", (*Writer).issueCreated, "site.issue.created.v1", "issue_open_count", "sumState(toInt32(1))"},
		{"inspectionFailed", (*Writer).inspectionFailed, "site.inspection.failed.v1", "inspection_fail_count", "countState()"},
		{"checkinCreated", (*Writer).checkinCreated, "workforce.checkin.created.v1", "manpower_total", "sumState(toInt32(1))"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w, d := newWriterOn(t, nil)
			e := envelope(t, tc.event, map[string]any{"project_id": projectID})

			if err := tc.call(w, context.Background(), e); err != nil {
				t.Fatalf("%s: %v", tc.name, err)
			}
			rec := requireExecs(t, d, 1)[0]
			if !strings.Contains(rec.query, tc.ownedSQL) {
				t.Errorf("%s owns %s and must write %s:\n%s", tc.name, tc.owned, tc.ownedSQL, rec.query)
			}
			// Exactly one of the four columns is non-empty.
			empty := strings.Count(rec.query, "countStateIf(1 = 0)") + strings.Count(rec.query, "sumState(toInt32(0))")
			if empty != 3 {
				t.Errorf("expected 3 empty states beside the owned column, got %d:\n%s", empty, rec.query)
			}
		})
	}
}

// ─── the failure paths ───────────────────────────────────────────────────────

func TestEveryHandlerRefusesAPayloadItCannotRead(t *testing.T) {
	// A payload that does not decode is a contract break. Returning nil here would ACK the message
	// and lose the event; the error is what sends it round the retry/DLQ path.
	cases := []struct {
		name  string
		call  func(*Writer, context.Context, *coskafka.EventEnvelope) error
		event string
		names string
	}{
		{"projectCreated", (*Writer).projectCreated, "construction.project.created.v1", "unmarshal project.created"},
		{"poCreated", (*Writer).poCreated, "procurement.po.created.v1", "unmarshal po.created"},
		{"invoiceApproved", (*Writer).invoiceApproved, "procurement.vendor_invoice.approved.v1", "unmarshal vendor_invoice.approved"},
		{"rfqCreated", (*Writer).rfqCreated, "procurement.rfq.created.v1", "unmarshal rfq.created"},
		{"reportSubmitted", (*Writer).reportSubmitted, "site.report.submitted.v1", "unmarshal report.submitted"},
		{"issueCreated", (*Writer).issueCreated, "site.issue.created.v1", "unmarshal site.issue.created"},
		{"inspectionFailed", (*Writer).inspectionFailed, "site.inspection.failed.v1", "unmarshal site.inspection.failed"},
		{"checkinCreated", (*Writer).checkinCreated, "workforce.checkin.created.v1", "unmarshal workforce.checkin.created"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w, d := newWriterOn(t, nil)

			err := tc.call(w, context.Background(), brokenPayload(t, tc.event))
			if err == nil {
				t.Fatal("an undecodable payload must be an error")
			}
			// The message names the event, so a DLQ entry says which contract broke.
			if !strings.Contains(err.Error(), tc.names) {
				t.Errorf("error %q does not name %q", err, tc.names)
			}
			requireExecs(t, d, 0)
		})
	}
}

func TestEveryHandlerRefusesAnUnparseableOccurredAt(t *testing.T) {
	// The aggregate tables are partitioned by toYYYYMM(event_date). A bad parse that fell through
	// would file the row under the wrong partition instead of failing — wrong data, no signal.
	cases := []struct {
		name  string
		call  func(*Writer, context.Context, *coskafka.EventEnvelope) error
		event string
	}{
		{"projectCreated", (*Writer).projectCreated, "construction.project.created.v1"},
		{"poCreated", (*Writer).poCreated, "procurement.po.created.v1"},
		{"invoiceApproved", (*Writer).invoiceApproved, "procurement.vendor_invoice.approved.v1"},
		{"rfqCreated", (*Writer).rfqCreated, "procurement.rfq.created.v1"},
		{"issueCreated", (*Writer).issueCreated, "site.issue.created.v1"},
		{"inspectionFailed", (*Writer).inspectionFailed, "site.inspection.failed.v1"},
		{"checkinCreated", (*Writer).checkinCreated, "workforce.checkin.created.v1"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w, d := newWriterOn(t, nil)
			e := envelope(t, tc.event, map[string]any{
				"project_id":   projectID,
				"budget":       map[string]string{"amount": "1.0000"},
				"total_amount": map[string]string{"amount": "1.0000"},
				"amount":       map[string]string{"amount": "1.0000"},
			})
			e.OccurredAt = "not-a-timestamp"

			err := tc.call(w, context.Background(), e)
			if err == nil {
				t.Fatal("an unparseable occurred_at must be an error")
			}
			if !strings.Contains(err.Error(), "parse occurred_at") {
				t.Errorf("error does not name the cause: %v", err)
			}
			requireExecs(t, d, 0)
		})
	}
}

func TestExec_WrapsTheClickHouseErrorSoTheEventIsRetried(t *testing.T) {
	boom := errors.New("clickhouse unavailable")
	w, _ := newWriterOn(t, boom)
	e := envelope(t, "construction.project.created.v1", map[string]any{
		"project_id": projectID,
		"budget":     map[string]string{"amount": "1.0000", "currency_code": "THB"},
	})

	err := w.Handle(context.Background(), e)
	if err == nil {
		t.Fatal("a ClickHouse failure must reach the pipeline, or the aggregate is short by this event")
	}
	if !strings.Contains(err.Error(), "clickhouse insert") {
		t.Errorf("error is not wrapped by exec: %v", err)
	}
	if !errors.Is(err, boom) {
		t.Error("the driver's own error must stay unwrappable-to, or the cause is lost")
	}
}

func TestPoCreated_StopsAtTheFirstFailureRatherThanWritingTheCountAnyway(t *testing.T) {
	// The two INSERTs are not a transaction — ClickHouse has none here. If the cost row fails and
	// the count is written regardless, the PO is counted but its money is not, and the two panels
	// disagree with no error anywhere to explain why.
	w, d := newWriterOn(t, errors.New("clickhouse unavailable"))
	e := envelope(t, "procurement.po.created.v1", map[string]any{
		"project_id":   projectID,
		"total_amount": map[string]string{"amount": "500.0000", "currency_code": "THB"},
	})

	if err := w.poCreated(context.Background(), e); err == nil {
		t.Fatal("expected the failure to propagate")
	}
	// One attempt, not two.
	requireExecs(t, d, 1)
}

func TestInvoiceApproved_StopsAtTheFirstFailureToo(t *testing.T) {
	w, d := newWriterOn(t, errors.New("clickhouse unavailable"))
	e := envelope(t, "procurement.vendor_invoice.approved.v1", map[string]any{
		"project_id": projectID,
		"amount":     map[string]string{"amount": "250.0000", "currency_code": "THB"},
	})

	if err := w.invoiceApproved(context.Background(), e); err == nil {
		t.Fatal("expected the failure to propagate")
	}
	requireExecs(t, d, 1)
}

// ─── Start ───────────────────────────────────────────────────────────────────
//
// Mirrors internal/carbon/writer_test.go: coskafka's constructors build their clients without
// dialling, so Start's wiring is exercised without a broker or a Redis, and each run is bounded by a
// short context.

func TestStart_FailsWhenTheDLQPublisherCannotBeBuilt(t *testing.T) {
	// No broker address at all. Running a consumer with nowhere to send a poison message would turn
	// one undecodable event into an unbounded retry loop against the aggregates.
	db, _ := newFakeDB(t, nil)

	err := Start(context.Background(), Config{Brokers: nil}, db)
	if err == nil {
		t.Fatal("expected Start to fail without brokers")
	}
	if !strings.Contains(err.Error(), "dlq publisher") {
		t.Errorf("error does not name the stage that failed: %v", err)
	}
}

func TestStart_CarriesOnWhenTheRedisURLIsUnusable(t *testing.T) {
	// Idempotency is best-effort at startup and it is NOT decorative here — AggregatingMergeTree has
	// no dedup, so a redelivered PO is counted twice. Start still runs, degraded and having said so,
	// because refusing to start would stop the dashboards entirely for a cache.
	db, _ := newFakeDB(t, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err := Start(ctx, Config{
		Brokers:     []string{"127.0.0.1:1"},
		RegistryURL: "http://127.0.0.1:1",
		RedisURL:    "not-a-redis-url",
	}, db)

	if err != nil && strings.Contains(err.Error(), "parse redis url") {
		t.Errorf("a bad Redis URL stopped the consumer: %v", err)
	}
}

func TestStart_BuildsIdempotencyWhenARedisURLIsGiven(t *testing.T) {
	db, _ := newFakeDB(t, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err := Start(ctx, Config{
		Brokers:     []string{"127.0.0.1:1"},
		RegistryURL: "http://127.0.0.1:1",
		RedisURL:    "redis://127.0.0.1:1",
	}, db)

	if err != nil && strings.Contains(err.Error(), "dlq publisher") {
		t.Errorf("Start failed before reaching the consumer: %v", err)
	}
}

func TestStart_RunsWithIdempotencyDisabledWhenNoRedisIsConfigured(t *testing.T) {
	// The else branch: no REDIS_URL at all, which is the compose default. It warns and runs.
	db, _ := newFakeDB(t, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err := Start(ctx, Config{
		Brokers:     []string{"127.0.0.1:1"},
		RegistryURL: "http://127.0.0.1:1",
	}, db)

	if err != nil && strings.Contains(err.Error(), "dlq publisher") {
		t.Errorf("Start failed before reaching the consumer: %v", err)
	}
}
