// Tests for the consumer supervisor and the config it starts with.
//
// §35.13 ESC-45: this was a closure inside main(), so the one piece of sequencing that matters —
// a rebuild must STOP the running consumer and wait for it before starting the replay — had no test
// at all. If the restart raced the shutdown, two consumers would write the same graph concurrently,
// one of them replaying the whole topic from the oldest offset.

package main

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// ─── consumerConfigFromEnv ───────────────────────────────────────────────────

func TestConsumerConfigFromEnv_UsesTheComposeDefaults(t *testing.T) {
	t.Setenv("KAFKA_BROKERS", "")
	t.Setenv("SCHEMA_REGISTRY_URL", "")
	t.Setenv("REDIS_URL", "")

	cfg := consumerConfigFromEnv()

	if len(cfg.Brokers) != 1 || cfg.Brokers[0] != "localhost:9092" {
		t.Errorf("Brokers = %v, want [localhost:9092]", cfg.Brokers)
	}
	if cfg.RegistryURL != "http://localhost:8081" {
		t.Errorf("RegistryURL = %q", cfg.RegistryURL)
	}
	// Empty, not a default. consumer.Start reads an empty RedisURL as "run without idempotency";
	// a localhost default would make the worker wait on a Redis nobody deployed.
	if cfg.RedisURL != "" {
		t.Errorf("RedisURL = %q, want empty when unset", cfg.RedisURL)
	}
}

func TestConsumerConfigFromEnv_SplitsAMultiBrokerList(t *testing.T) {
	t.Setenv("KAFKA_BROKERS", "b1:9092,b2:9092")
	t.Setenv("SCHEMA_REGISTRY_URL", "http://registry:8081")
	t.Setenv("REDIS_URL", "redis://cache:6379")

	cfg := consumerConfigFromEnv()

	if len(cfg.Brokers) != 2 || cfg.Brokers[0] != "b1:9092" || cfg.Brokers[1] != "b2:9092" {
		t.Errorf("Brokers = %v", cfg.Brokers)
	}
	if cfg.RegistryURL != "http://registry:8081" || cfg.RedisURL != "redis://cache:6379" {
		t.Errorf("endpoints not carried through: %+v", cfg)
	}
}

// ─── supervisor ──────────────────────────────────────────────────────────────

// recorder is a runFunc that blocks until its context is cancelled, recording every start.
type recorder struct {
	mu        sync.Mutex
	resets    []bool
	running   atomic.Int32
	maxAtOnce atomic.Int32
	err       error
}

func (r *recorder) run(ctx context.Context, resetOffset bool) error {
	r.mu.Lock()
	r.resets = append(r.resets, resetOffset)
	r.mu.Unlock()

	n := r.running.Add(1)
	for {
		if m := r.maxAtOnce.Load(); n > m {
			if r.maxAtOnce.CompareAndSwap(m, n) {
				break
			}
			continue
		}
		break
	}
	defer r.running.Add(-1)

	if r.err != nil {
		return r.err
	}
	<-ctx.Done()
	return ctx.Err()
}

func (r *recorder) startedWith() []bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]bool(nil), r.resets...)
}

func waitFor(t *testing.T, cond func() bool, why string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting: %s", why)
}

func TestSupervisor_StartsTheConsumerWithoutAnOffsetReset(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	rec := &recorder{}
	sup := newSupervisor(ctx, cancel, rec.run)

	sup.start(false)
	waitFor(t, func() bool { return len(rec.startedWith()) == 1 }, "the consumer to start")
	sup.stop()

	if got := rec.startedWith(); len(got) != 1 || got[0] {
		t.Errorf("started with %v, want one start with resetOffset=false", got)
	}
}

func TestSupervisor_RebuildRestartsFromTheOldestOffset(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	rec := &recorder{}
	sup := newSupervisor(ctx, cancel, rec.run)
	sup.start(false)
	waitFor(t, func() bool { return len(rec.startedWith()) == 1 }, "the first consumer to start")

	ch := make(chan bool, 1)
	go sup.serveRebuilds(ch)
	ch <- true

	waitFor(t, func() bool { return len(rec.startedWith()) == 2 }, "the rebuild consumer to start")
	got := rec.startedWith()
	if got[1] != true {
		t.Error("the rebuild started without resetOffset — it would not replay history")
	}

	close(ch)
	sup.stop()
}

func TestSupervisor_NeverRunsTwoConsumersAtOnce(t *testing.T) {
	// The sequencing this exists to protect: cancel, WAIT, then restart. Without the wait, the
	// replaying consumer and the one being shut down would both be writing the graph.
	ctx, cancel := context.WithCancel(context.Background())
	rec := &recorder{}
	sup := newSupervisor(ctx, cancel, rec.run)
	sup.start(false)
	waitFor(t, func() bool { return len(rec.startedWith()) == 1 }, "the first consumer to start")

	ch := make(chan bool, 1)
	go sup.serveRebuilds(ch)
	for i := 0; i < 3; i++ {
		ch <- true
		waitFor(t, func() bool { return len(rec.startedWith()) == i+2 }, "the next rebuild to start")
	}
	close(ch)
	sup.stop()

	if m := rec.maxAtOnce.Load(); m > 1 {
		t.Errorf("%d consumers ran concurrently — a rebuild raced the shutdown", m)
	}
}

func TestSupervisor_ARebuiltConsumerSurvivesTheOriginalContextBeingCancelled(t *testing.T) {
	// serveRebuilds gives the replay a FRESH context. If it reused the cancelled one, the rebuild
	// would start and immediately stop, and the graph would never be rebuilt.
	ctx, cancel := context.WithCancel(context.Background())
	rec := &recorder{}
	sup := newSupervisor(ctx, cancel, rec.run)
	sup.start(false)
	waitFor(t, func() bool { return len(rec.startedWith()) == 1 }, "the first consumer to start")

	ch := make(chan bool, 1)
	go sup.serveRebuilds(ch)
	ch <- true
	waitFor(t, func() bool { return len(rec.startedWith()) == 2 }, "the rebuild to start")

	// Still running after the rebuild handed it a new context.
	waitFor(t, func() bool { return rec.running.Load() == 1 }, "the rebuilt consumer to be running")

	close(ch)
	sup.stop()
}

func TestSupervisor_StopIsWhatEndsTheConsumer(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	rec := &recorder{}
	sup := newSupervisor(ctx, cancel, rec.run)
	sup.start(false)
	waitFor(t, func() bool { return rec.running.Load() == 1 }, "the consumer to start")

	sup.stop() // returns only once the goroutine has exited

	if n := rec.running.Load(); n != 0 {
		t.Errorf("%d consumers still running after stop()", n)
	}
}

func TestSupervisor_AConsumerThatFailsOnItsOwnDoesNotBlockShutdown(t *testing.T) {
	// consumer.Start returns an error when it cannot build its DLQ publisher. That is logged and the
	// goroutine ends; stop() must still return rather than waiting on a consumer that is already
	// gone.
	ctx, cancel := context.WithCancel(context.Background())
	rec := &recorder{err: errors.New("dlq publisher: no brokers")}
	sup := newSupervisor(ctx, cancel, rec.run)

	sup.start(false)
	done := make(chan struct{})
	go func() { sup.stop(); close(done) }()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("stop() hung after the consumer had already exited")
	}
}
