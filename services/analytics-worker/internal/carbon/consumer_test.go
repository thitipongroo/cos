// Unit tests for Carbon consumer — Phase 24
//
// §35.13 ESC-23: the previous version of this file only unmarshalled a struct literal and called
// nothing in consumer.go, so the module measured 0.0% coverage. These tests exercise the real
// code paths using a fake database/sql driver and fake sarama session/claim implementations —
// stdlib + sarama only, so no new module dependency is introduced.
package carbon

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/IBM/sarama"
)

// ─── fake database/sql driver ────────────────────────────────────────────────

// execRecord captures one ExecContext call so a test can assert on the SQL and its bindings.
type execRecord struct {
	query string
	args  []driver.NamedValue
}

type fakeDriver struct {
	mu    sync.Mutex
	execs []execRecord
	err   error // returned by every ExecContext when set
}

func (d *fakeDriver) Open(string) (driver.Conn, error) { return &fakeConn{drv: d}, nil }

type fakeConn struct{ drv *fakeDriver }

func (c *fakeConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("not implemented") }
func (c *fakeConn) Close() error                        { return nil }
func (c *fakeConn) Begin() (driver.Tx, error)           { return nil, errors.New("not implemented") }

// ExecContext makes fakeConn a driver.ExecerContext, so database/sql routes ExecContext here
// without going through Prepare.
func (c *fakeConn) ExecContext(_ context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	c.drv.mu.Lock()
	defer c.drv.mu.Unlock()
	c.drv.execs = append(c.drv.execs, execRecord{query: query, args: args})
	if c.drv.err != nil {
		return nil, c.drv.err
	}
	return driver.RowsAffected(1), nil
}

var registerOnce sync.Map // driver name -> struct{}, so repeated registration does not panic

// newFakeDB registers a uniquely named fake driver and returns an open *sql.DB plus the driver,
// which records every ExecContext the consumer issues.
func newFakeDB(t *testing.T, name string, execErr error) (*sql.DB, *fakeDriver) {
	t.Helper()
	drv := &fakeDriver{err: execErr}
	if _, loaded := registerOnce.LoadOrStore(name, struct{}{}); loaded {
		t.Fatalf("driver name %q registered twice — give each test a unique name", name)
	}
	sql.Register(name, drv)
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, drv
}

// ─── fake sarama session / claim ─────────────────────────────────────────────

type fakeSession struct {
	ctx    context.Context
	marked []*sarama.ConsumerMessage
}

func (s *fakeSession) Claims() map[string][]int32 { return nil }
func (s *fakeSession) MemberID() string           { return "member-1" }
func (s *fakeSession) GenerationID() int32        { return 1 }
func (s *fakeSession) MarkOffset(string, int32, int64, string) {}
func (s *fakeSession) Commit()                                 {}
func (s *fakeSession) ResetOffset(string, int32, int64, string) {}
func (s *fakeSession) MarkMessage(msg *sarama.ConsumerMessage, _ string) {
	s.marked = append(s.marked, msg)
}
func (s *fakeSession) Context() context.Context { return s.ctx }

type fakeClaim struct{ msgs chan *sarama.ConsumerMessage }

func (c *fakeClaim) Topic() string                            { return Topic }
func (c *fakeClaim) Partition() int32                         { return 0 }
func (c *fakeClaim) InitialOffset() int64                     { return 0 }
func (c *fakeClaim) HighWaterMarkOffset() int64               { return 0 }
func (c *fakeClaim) Messages() <-chan *sarama.ConsumerMessage { return c.msgs }

// newClaim returns a claim whose channel is already closed, so ConsumeClaim's range terminates.
func newClaim(msgs ...*sarama.ConsumerMessage) *fakeClaim {
	ch := make(chan *sarama.ConsumerMessage, len(msgs))
	for _, m := range msgs {
		ch <- m
	}
	close(ch)
	return &fakeClaim{msgs: ch}
}

// ─── fixtures ────────────────────────────────────────────────────────────────

func validEvent() CarbonRecordEvent {
	return CarbonRecordEvent{
		EventType:          "carbon.record.created.v1",
		TenantID:           "t1",
		ProjectID:          "p1",
		CarbonRecordID:     "cr1",
		ConsumptionID:      "c1",
		MaterialID:         "m1",
		QuantityConsumed:   10.5,
		Unit:               "kg",
		CarbonFactor:       2.5,
		CarbonFactorSource: "EPD-2023-001",
		CarbonKgco2e:       26.25,
		RecordedAt:         "2026-06-08T00:00:00Z",
		GHGScope:           "SCOPE_3",
	}
}

func mustMessage(t *testing.T, ev CarbonRecordEvent) *sarama.ConsumerMessage {
	t.Helper()
	b, err := json.Marshal(ev)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return &sarama.ConsumerMessage{Topic: Topic, Value: b, Offset: 42}
}

// ─── tests ───────────────────────────────────────────────────────────────────

func TestCarbonRecordEvent_Unmarshal(t *testing.T) {
	raw := `{
		"event_type":           "carbon.record.created.v1",
		"tenant_id":            "t1",
		"project_id":           "p1",
		"carbon_record_id":     "cr1",
		"consumption_id":       "c1",
		"material_id":          "m1",
		"quantity_consumed":    10.5,
		"unit":                 "kg",
		"carbon_factor":        2.5,
		"carbon_factor_source": "EPD-2023-001",
		"carbon_kgco2e":        26.25,
		"recorded_at":          "2026-06-08T00:00:00Z",
		"ghg_scope":            "SCOPE_3"
	}`
	var ev CarbonRecordEvent
	if err := json.Unmarshal([]byte(raw), &ev); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if ev.CarbonKgco2e != 26.25 {
		t.Errorf("carbon_kgco2e = %v, want 26.25", ev.CarbonKgco2e)
	}
	if ev.GHGScope != "SCOPE_3" {
		t.Errorf("ghg_scope = %q, want SCOPE_3", ev.GHGScope)
	}
}

func TestTopicAndConsumerGroupAreTheSpecifiedNames(t *testing.T) {
	if Topic != "carbon.record.created.v1" {
		t.Errorf("Topic = %q", Topic)
	}
	if ConsumerGroup != "analytics-worker-carbon" {
		t.Errorf("ConsumerGroup = %q", ConsumerGroup)
	}
}

func TestNewConsumer_SetsClickHouseAndLogger(t *testing.T) {
	db, _ := newFakeDB(t, "carbon-new", nil)
	c := NewConsumer(db)
	if c.clickhouse != db {
		t.Error("clickhouse handle not stored")
	}
	if c.logger == nil {
		t.Error("logger not initialised")
	}
}

func TestSetupAndCleanupAreNoOps(t *testing.T) {
	db, _ := newFakeDB(t, "carbon-lifecycle", nil)
	c := NewConsumer(db)
	if err := c.Setup(&fakeSession{ctx: context.Background()}); err != nil {
		t.Errorf("Setup: %v", err)
	}
	if err := c.Cleanup(&fakeSession{ctx: context.Background()}); err != nil {
		t.Errorf("Cleanup: %v", err)
	}
}

// The INSERT must name the schema-qualified ClickHouse table and bind all 12 columns in order.
func TestInsertToClickHouse_BindsEveryColumnInOrder(t *testing.T) {
	db, drv := newFakeDB(t, "carbon-insert", nil)
	c := NewConsumer(db)
	ev := validEvent()

	if err := c.insertToClickHouse(context.Background(), &ev); err != nil {
		t.Fatalf("insertToClickHouse: %v", err)
	}

	if len(drv.execs) != 1 {
		t.Fatalf("exec calls = %d, want 1", len(drv.execs))
	}
	rec := drv.execs[0]
	if !strings.Contains(rec.query, "carbon_analytics.carbon_records") {
		t.Errorf("query is not schema-qualified: %s", rec.query)
	}
	if len(rec.args) != 12 {
		t.Fatalf("bound args = %d, want 12", len(rec.args))
	}
	want := []any{
		ev.CarbonRecordID, ev.TenantID, ev.ProjectID, ev.ConsumptionID, ev.MaterialID,
		ev.QuantityConsumed, ev.Unit, ev.CarbonFactor, ev.CarbonFactorSource,
		ev.CarbonKgco2e, ev.GHGScope, ev.RecordedAt,
	}
	for i, w := range want {
		if rec.args[i].Value != driver.Value(w) {
			t.Errorf("arg %d = %v, want %v", i, rec.args[i].Value, w)
		}
	}
}

func TestInsertToClickHouse_PropagatesDriverError(t *testing.T) {
	boom := errors.New("clickhouse unavailable")
	db, _ := newFakeDB(t, "carbon-insert-err", boom)
	c := NewConsumer(db)
	ev := validEvent()

	err := c.insertToClickHouse(context.Background(), &ev)
	if err == nil {
		t.Fatal("expected an error")
	}
}

func TestProcess_InsertsValidEvent(t *testing.T) {
	db, drv := newFakeDB(t, "carbon-process-ok", nil)
	c := NewConsumer(db)

	if err := c.process(context.Background(), mustMessage(t, validEvent())); err != nil {
		t.Fatalf("process: %v", err)
	}
	if len(drv.execs) != 1 {
		t.Errorf("exec calls = %d, want 1", len(drv.execs))
	}
}

func TestProcess_ReturnsUnmarshalError(t *testing.T) {
	db, drv := newFakeDB(t, "carbon-process-badjson", nil)
	c := NewConsumer(db)

	msg := &sarama.ConsumerMessage{Topic: Topic, Value: []byte("{not json"), Offset: 7}
	err := c.process(context.Background(), msg)
	if err == nil {
		t.Fatal("expected an unmarshal error")
	}
	if !strings.Contains(err.Error(), "unmarshal") {
		t.Errorf("error %q should be wrapped as an unmarshal failure", err)
	}
	if len(drv.execs) != 0 {
		t.Error("a malformed message must not reach ClickHouse")
	}
}

func TestProcess_WrapsClickHouseError(t *testing.T) {
	db, _ := newFakeDB(t, "carbon-process-dberr", errors.New("write failed"))
	c := NewConsumer(db)

	err := c.process(context.Background(), mustMessage(t, validEvent()))
	if err == nil {
		t.Fatal("expected an error")
	}
	if !strings.Contains(err.Error(), "clickhouse insert") {
		t.Errorf("error %q should be wrapped as a clickhouse insert failure", err)
	}
}

func TestConsumeClaim_ProcessesAndMarksEveryMessage(t *testing.T) {
	db, drv := newFakeDB(t, "carbon-claim-ok", nil)
	c := NewConsumer(db)
	sess := &fakeSession{ctx: context.Background()}
	claim := newClaim(mustMessage(t, validEvent()), mustMessage(t, validEvent()))

	if err := c.ConsumeClaim(sess, claim); err != nil {
		t.Fatalf("ConsumeClaim: %v", err)
	}
	if len(drv.execs) != 2 {
		t.Errorf("exec calls = %d, want 2", len(drv.execs))
	}
	if len(sess.marked) != 2 {
		t.Errorf("marked = %d, want 2", len(sess.marked))
	}
}

// A message that fails to process is logged and STILL marked — otherwise the group redelivers it
// forever. This asserts that at-least-once does not become an infinite loop on a poison message.
func TestConsumeClaim_MarksMessageEvenWhenProcessingFails(t *testing.T) {
	db, _ := newFakeDB(t, "carbon-claim-err", nil)
	c := NewConsumer(db)
	sess := &fakeSession{ctx: context.Background()}
	poison := &sarama.ConsumerMessage{Topic: Topic, Value: []byte("{not json"), Offset: 9}
	claim := newClaim(poison)

	if err := c.ConsumeClaim(sess, claim); err != nil {
		t.Fatalf("ConsumeClaim must not return the per-message error: %v", err)
	}
	if len(sess.marked) != 1 {
		t.Fatalf("marked = %d, want 1", len(sess.marked))
	}
	if sess.marked[0].Offset != 9 {
		t.Errorf("marked offset = %d, want 9", sess.marked[0].Offset)
	}
}

func TestConsumeClaim_ReturnsImmediatelyOnClosedChannel(t *testing.T) {
	db, drv := newFakeDB(t, "carbon-claim-empty", nil)
	c := NewConsumer(db)
	sess := &fakeSession{ctx: context.Background()}

	if err := c.ConsumeClaim(sess, newClaim()); err != nil {
		t.Fatalf("ConsumeClaim: %v", err)
	}
	if len(drv.execs) != 0 || len(sess.marked) != 0 {
		t.Error("no messages means no work")
	}
}
