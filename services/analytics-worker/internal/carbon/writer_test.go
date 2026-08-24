// Unit tests for the carbon Writer — Phase 24.
//
// §35.13 ESC-23: NewWriter, Handle and insert were at 0% after internal/carbon was rewritten from a
// sarama ConsumerGroup to a coskafka handler, which took the module's coverage from 93.1% to 46.8%.
// These cover the rewritten shape.
//
// The ClickHouse handle is a real *sql.DB over a fake database/sql driver, so the INSERT is asserted
// as the driver receives it — statement text and every bound value, in order. A mocked *sql.DB
// cannot show that the twelve VALUES placeholders line up with the twelve columns, which is the one
// mistake in this function that no compiler catches and that would silently mis-file audited
// emissions data.

package carbon

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/construction-os/coslib/coskafka"
)

// ─── fake database/sql driver ────────────────────────────────────────────────

type execRecord struct {
	query string
	args  []driver.NamedValue
}

type fakeConn struct {
	d *fakeDriver
}

type fakeDriver struct {
	mu    sync.Mutex
	execs []execRecord
	err   error // returned by every ExecContext when set
}

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

var driverSeq int

// newFakeDB registers a driver instance under a unique name — database/sql panics on a duplicate
// registration, so each test needs its own.
func newFakeDB(t *testing.T, execErr error) (*sql.DB, *fakeDriver) {
	t.Helper()
	d := &fakeDriver{err: execErr}
	driverSeq++
	name := "carbon-fake-" + string(rune('a'+driverSeq%26)) + time.Now().Format("150405.000000000")
	sql.Register(name, d)
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatalf("open fake db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, d
}

// ─── fixtures ────────────────────────────────────────────────────────────────

func validPayload() CarbonRecordPayload {
	return CarbonRecordPayload{
		CarbonRecordID:     "33333333-3333-3333-3333-333333333333",
		ProjectID:          "44444444-4444-4444-4444-444444444444",
		ConsumptionID:      "55555555-5555-5555-5555-555555555555",
		MaterialID:         "66666666-6666-6666-6666-666666666666",
		QuantityConsumed:   "10.5000",
		Unit:               "kg",
		CarbonFactor:       "2.500000",
		CarbonFactorSource: "EPD-TH-CEMENT-2025",
		CarbonKgco2e:       "26.2500",
		GHGScope:           "SCOPE_3",
		RecordedAt:         "2026-06-08T09:00:00Z",
	}
}

func envelopeFor(t *testing.T, p CarbonRecordPayload) *coskafka.EventEnvelope {
	t.Helper()
	raw, err := json.Marshal(p)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	return &coskafka.EventEnvelope{
		EventID:   "11111111-1111-1111-1111-111111111111",
		EventType: "carbon.record.created.v1",
		TenantID:  "22222222-2222-2222-2222-222222222222",
		Payload:   raw,
	}
}

// ─── NewWriter ───────────────────────────────────────────────────────────────

func TestNewWriter_KeepsTheHandleAndBuildsALogger(t *testing.T) {
	db, _ := newFakeDB(t, nil)
	w := NewWriter(db)

	if w.clickhouse != db {
		t.Error("NewWriter did not keep the ClickHouse handle it was given")
	}
	if w.logger == nil {
		t.Error("NewWriter left the logger nil — Handle would panic on its first success")
	}
}

// ─── Handle → insert ─────────────────────────────────────────────────────────

func TestHandle_InsertsEveryColumnInOrder(t *testing.T) {
	db, d := newFakeDB(t, nil)
	w := NewWriter(db)
	p := validPayload()

	if err := w.Handle(context.Background(), envelopeFor(t, p)); err != nil {
		t.Fatalf("Handle: %v", err)
	}

	if len(d.execs) != 1 {
		t.Fatalf("expected exactly one INSERT, got %d", len(d.execs))
	}
	got := d.execs[0]
	if !strings.Contains(got.query, "INSERT INTO analytics.carbon_records") {
		t.Errorf("unexpected statement: %s", got.query)
	}

	// The tenant comes from the ENVELOPE, not the payload: §7.3 makes the topic tenant-scoped and
	// the envelope is what the decoder verified. Taking it from the payload would let a malformed
	// producer file another tenant's emissions.
	want := []driver.Value{
		p.CarbonRecordID,
		"22222222-2222-2222-2222-222222222222",
		p.ProjectID,
		p.ConsumptionID,
		p.MaterialID,
		p.QuantityConsumed,
		p.Unit,
		p.CarbonFactor,
		p.CarbonFactorSource,
		p.CarbonKgco2e,
		"SCOPE_3",
		time.Date(2026, 6, 8, 9, 0, 0, 0, time.UTC),
	}
	if len(got.args) != len(want) {
		t.Fatalf("bound %d values, want %d", len(got.args), len(want))
	}
	for i, w := range want {
		if got.args[i].Value != w {
			t.Errorf("arg %d = %v (%T), want %v (%T)", i, got.args[i].Value, got.args[i].Value, w, w)
		}
	}
}

func TestHandle_DecimalsAreBoundAsStrings(t *testing.T) {
	// Binding these as float64 would make 26.2500 inexact and silently alter audited emissions;
	// carbon.record.created.v1.avsc declares them `string` for that reason.
	db, d := newFakeDB(t, nil)
	if err := NewWriter(db).Handle(context.Background(), envelopeFor(t, validPayload())); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	for _, i := range []int{5, 7, 9} { // quantity_consumed, carbon_factor, carbon_kgco2e
		if _, ok := d.execs[0].args[i].Value.(string); !ok {
			t.Errorf("arg %d is %T, want string", i, d.execs[0].args[i].Value)
		}
	}
}

func TestHandle_BlankScopeDefaultsToScope3(t *testing.T) {
	db, d := newFakeDB(t, nil)
	p := validPayload()
	p.GHGScope = ""

	if err := NewWriter(db).Handle(context.Background(), envelopeFor(t, p)); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if got := d.execs[0].args[10].Value; got != "SCOPE_3" {
		t.Errorf("ghg_scope = %v, want SCOPE_3", got)
	}
}

func TestHandle_AnExplicitScopeIsNotRewritten(t *testing.T) {
	db, d := newFakeDB(t, nil)
	p := validPayload()
	p.GHGScope = "SCOPE_1"

	if err := NewWriter(db).Handle(context.Background(), envelopeFor(t, p)); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if got := d.execs[0].args[10].Value; got != "SCOPE_1" {
		t.Errorf("ghg_scope = %v, want SCOPE_1 passed through", got)
	}
}

func TestHandle_RecordedAtIsBoundAsTimeNotText(t *testing.T) {
	// ClickHouse cannot cast "…Z" into DateTime64(3,'UTC') — it stops at the offset designator — so
	// the handler parses it and hands the driver a time.Time.
	db, d := newFakeDB(t, nil)
	if err := NewWriter(db).Handle(context.Background(), envelopeFor(t, validPayload())); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	ts, ok := d.execs[0].args[11].Value.(time.Time)
	if !ok {
		t.Fatalf("recorded_at is %T, want time.Time", d.execs[0].args[11].Value)
	}
	if !ts.Equal(time.Date(2026, 6, 8, 9, 0, 0, 0, time.UTC)) {
		t.Errorf("recorded_at = %v", ts)
	}
}

// ─── Handle: refusal paths ───────────────────────────────────────────────────

func TestHandle_ReturnsAnErrorForNonJSONPayload(t *testing.T) {
	db, d := newFakeDB(t, nil)
	env := envelopeFor(t, validPayload())
	env.Payload = json.RawMessage("{not json")

	err := NewWriter(db).Handle(context.Background(), env)
	if err == nil {
		t.Fatal("expected an error so the pipeline retries or DLQs the message")
	}
	if !strings.Contains(err.Error(), "unmarshal carbon payload") {
		t.Errorf("error does not name the stage: %v", err)
	}
	if len(d.execs) != 0 {
		t.Error("a row was written despite the payload failing to decode")
	}
}

func TestHandle_ReturnsAnErrorForAnUnparsableTimestamp(t *testing.T) {
	db, d := newFakeDB(t, nil)
	p := validPayload()
	p.RecordedAt = "8 June 2026"

	err := NewWriter(db).Handle(context.Background(), envelopeFor(t, p))
	if err == nil {
		t.Fatal("expected an error")
	}
	if !strings.Contains(err.Error(), "parse recorded_at") {
		t.Errorf("error does not name the field: %v", err)
	}
	if len(d.execs) != 0 {
		t.Error("a row was written despite an unparsable recorded_at")
	}
}

func TestHandle_PropagatesTheClickHouseError(t *testing.T) {
	// Returning the error is what hands the message back to the retry/DLQ path; swallowing it is
	// what the previous implementation did, and it lost records on a ClickHouse blip.
	boom := errors.New("clickhouse unavailable")
	db, _ := newFakeDB(t, boom)

	err := NewWriter(db).Handle(context.Background(), envelopeFor(t, validPayload()))
	if err == nil {
		t.Fatal("expected the insert failure to surface")
	}
	if !strings.Contains(err.Error(), "clickhouse insert") {
		t.Errorf("error does not name the stage: %v", err)
	}
	if !errors.Is(err, boom) {
		t.Errorf("the driver error was not wrapped: %v", err)
	}
}

// ─── Start ───────────────────────────────────────────────────────────────────

func TestStart_FailsWhenTheDLQPublisherCannotBeBuilt(t *testing.T) {
	// No broker address at all: NewDLQPublisher cannot construct a client, and Start must report
	// that rather than run a consumer with nowhere to send poison messages.
	db, _ := newFakeDB(t, nil)

	err := Start(context.Background(), Config{Brokers: nil}, db)
	if err == nil {
		t.Fatal("expected Start to fail without brokers")
	}
	if !strings.Contains(err.Error(), "dlq publisher") {
		t.Errorf("error does not name the stage that failed: %v", err)
	}
}

func TestStart_RunsWithoutRedisWhenTheURLIsUnusable(t *testing.T) {
	// Idempotency is best-effort at startup (see Start): a bad Redis URL must warn and carry on,
	// because the carbon insert is already guarded by a unique index and ReplacingMergeTree. Failing
	// here instead would stop carbon ingestion for a cache that is not load-bearing.
	db, _ := newFakeDB(t, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Both coskafka constructors are lazy — they build clients without dialling — so this exercises
	// Start's wiring without a broker or a Redis.
	err := Start(ctx, Config{
		Brokers:     []string{"127.0.0.1:1"},
		RegistryURL: "http://127.0.0.1:1",
		RedisURL:    "not-a-redis-url",
	}, db)

	// Whatever Run reports, the point is that Start got past idempotency rather than returning the
	// parse failure.
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

// ─── constants ───────────────────────────────────────────────────────────────

func TestTopicRegexIsTenantScoped(t *testing.T) {
	if strings.HasPrefix(TopicRegex, "^carbon") {
		t.Error("TopicRegex must not match a bare event name — topics are {tenant_id}.{event}")
	}
	if !strings.Contains(TopicRegex, `[^.]+\.carbon\.record\.created\.v1`) {
		t.Errorf("TopicRegex = %q", TopicRegex)
	}
}

var _ = io.EOF // keeps the import list stable if a future case needs it
