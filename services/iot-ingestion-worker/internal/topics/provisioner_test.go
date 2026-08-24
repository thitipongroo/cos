package topics

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
)

type call struct {
	topic             string
	partitions        int32
	replicationFactor int16
}

type fakeCreator struct {
	mu    sync.Mutex
	calls []call
	err   error
}

func (f *fakeCreator) CreateTopic(_ context.Context, topic string, partitions int32, rf int16) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, call{topic, partitions, rf})
	return f.err
}

func (f *fakeCreator) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.calls)
}

func TestEnsureCreatesTopicOnFirstUse(t *testing.T) {
	f := &fakeCreator{}
	if err := NewEnsurer(f).Ensure(context.Background(), "tenant-a.iot.telemetry.v1"); err != nil {
		t.Fatalf("Ensure() = %v, want nil", err)
	}
	if f.count() != 1 {
		t.Fatalf("CreateTopic called %d times, want 1", f.count())
	}
	if f.calls[0].topic != "tenant-a.iot.telemetry.v1" {
		t.Errorf("topic = %q", f.calls[0].topic)
	}
}

// Geometry must match the TypeScript producer (KAFKA_TOPIC_PARTITIONS/REPLICATION_FACTOR default
// 3/1) so a topic is identical whichever side happens to create it first.
func TestEnsureUsesTypeScriptDefaultGeometry(t *testing.T) {
	t.Setenv("KAFKA_TOPIC_PARTITIONS", "")
	t.Setenv("KAFKA_TOPIC_REPLICATION_FACTOR", "")
	f := &fakeCreator{}
	_ = NewEnsurer(f).Ensure(context.Background(), "t.x")

	if f.calls[0].partitions != 3 || f.calls[0].replicationFactor != 1 {
		t.Errorf("geometry = %d/%d, want 3/1", f.calls[0].partitions, f.calls[0].replicationFactor)
	}
}

func TestEnsureReadsGeometryFromEnv(t *testing.T) {
	t.Setenv("KAFKA_TOPIC_PARTITIONS", "6")
	t.Setenv("KAFKA_TOPIC_REPLICATION_FACTOR", "3")
	f := &fakeCreator{}
	_ = NewEnsurer(f).Ensure(context.Background(), "t.x")

	if f.calls[0].partitions != 6 || f.calls[0].replicationFactor != 3 {
		t.Errorf("geometry = %d/%d, want 6/3", f.calls[0].partitions, f.calls[0].replicationFactor)
	}
}

func TestEnsureFallsBackOnNonNumericEnv(t *testing.T) {
	t.Setenv("KAFKA_TOPIC_PARTITIONS", "not-a-number")
	f := &fakeCreator{}
	_ = NewEnsurer(f).Ensure(context.Background(), "t.x")

	if f.calls[0].partitions != 3 {
		t.Errorf("partitions = %d, want the 3 default", f.calls[0].partitions)
	}
}

// A device reporting every few seconds must not issue a CreateTopics per message.
func TestEnsureIsCachedPerTopic(t *testing.T) {
	f := &fakeCreator{}
	e := NewEnsurer(f)
	for range 5 {
		if err := e.Ensure(context.Background(), "tenant-a.iot.telemetry.v1"); err != nil {
			t.Fatalf("Ensure() = %v", err)
		}
	}
	if f.count() != 1 {
		t.Errorf("CreateTopic called %d times for one topic, want 1", f.count())
	}
}

func TestEnsureCreatesEachDistinctTopic(t *testing.T) {
	f := &fakeCreator{}
	e := NewEnsurer(f)
	_ = e.Ensure(context.Background(), "tenant-a.iot.telemetry.v1")
	_ = e.Ensure(context.Background(), "tenant-b.iot.telemetry.v1")

	if f.count() != 2 {
		t.Errorf("CreateTopic called %d times for two topics, want 2", f.count())
	}
}

// The error is surfaced, not swallowed — the caller drops the message rather than publishing to a
// topic that does not exist.
func TestEnsurePropagatesCreateError(t *testing.T) {
	want := errors.New("broker unreachable")
	f := &fakeCreator{err: want}
	if err := NewEnsurer(f).Ensure(context.Background(), "t.x"); !errors.Is(err, want) {
		t.Fatalf("Ensure() = %v, want %v", err, want)
	}
}

// A failed create must NOT be cached, or one transient broker blip would permanently stop that
// tenant's telemetry for the lifetime of the process.
func TestEnsureDoesNotCacheFailures(t *testing.T) {
	f := &fakeCreator{err: errors.New("transient")}
	e := NewEnsurer(f)
	_ = e.Ensure(context.Background(), "t.x")

	f.mu.Lock()
	f.err = nil
	f.mu.Unlock()

	if err := e.Ensure(context.Background(), "t.x"); err != nil {
		t.Fatalf("retry after transient failure = %v, want nil", err)
	}
	if f.count() != 2 {
		t.Errorf("CreateTopic called %d times, want 2 (retry after failure)", f.count())
	}
}

// A burst of telemetry for one new tenant must collapse to a single CreateTopics call.
func TestEnsureIsConcurrencySafe(t *testing.T) {
	f := &fakeCreator{}
	e := NewEnsurer(f)

	var wg sync.WaitGroup
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = e.Ensure(context.Background(), "tenant-a.iot.telemetry.v1")
		}()
	}
	wg.Wait()

	if f.count() != 1 {
		t.Errorf("CreateTopic called %d times under concurrency, want 1", f.count())
	}
}

// ─── kadm adapter ────────────────────────────────────────────────────────────
// foldCreateResponses is the half of KadmCreator that makes a decision; it is tested directly so
// the "already exists is not an error" rule is covered without a broker.

func TestFoldCreateResponsesAcceptsSuccess(t *testing.T) {
	resp := kadm.CreateTopicResponses{"t.x": kadm.CreateTopicResponse{Topic: "t.x"}}
	if err := foldCreateResponses(resp); err != nil {
		t.Errorf("foldCreateResponses(success) = %v, want nil", err)
	}
}

func TestFoldCreateResponsesTreatsAlreadyExistsAsSuccess(t *testing.T) {
	resp := kadm.CreateTopicResponses{
		"t.x": kadm.CreateTopicResponse{Topic: "t.x", Err: kerr.TopicAlreadyExists},
	}
	if err := foldCreateResponses(resp); err != nil {
		t.Errorf("foldCreateResponses(already-exists) = %v, want nil (idempotent)", err)
	}
}

func TestFoldCreateResponsesPropagatesRealError(t *testing.T) {
	resp := kadm.CreateTopicResponses{
		"t.x": kadm.CreateTopicResponse{Topic: "t.x", Err: kerr.InvalidReplicationFactor},
	}
	if err := foldCreateResponses(resp); !errors.Is(err, kerr.InvalidReplicationFactor) {
		t.Errorf("foldCreateResponses(real error) = %v, want InvalidReplicationFactor", err)
	}
}

func TestNewKadmCreatorWrapsClient(t *testing.T) {
	// kgo.NewClient does not dial — no broker is contacted here.
	cl, err := kgo.NewClient(kgo.SeedBrokers("localhost:29092"))
	if err != nil {
		t.Fatalf("kgo.NewClient: %v", err)
	}
	defer cl.Close()

	c := NewKadmCreator(cl)
	if c == nil || c.admin == nil {
		t.Fatal("NewKadmCreator returned an unusable creator")
	}
	var _ Creator = c // must satisfy the interface main.go depends on
}
