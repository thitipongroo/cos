// Package topics creates a tenant's Kafka topic explicitly before the first publish to it.
//
// WHY THIS EXISTS: `auto.create.topics.enable` is false on every real broker and producers run with
// auto-topic-creation disabled (context.md "Provision Kafka topics explicitly"; Phase 8 exit
// criteria "allowAutoTopicCreation:false"). Kafka will therefore never materialise a topic for us,
// so whoever publishes first has to create it. On the TypeScript side that is
// KafkaProducer.ensureTopic (packages/@cos/kafka/src/producer.ts); this is the Go port of the
// same contract, because a Go worker does not go through the TS SDK.
//
// It is deliberately NOT eager provisioning of the whole per-tenant catalogue: that made the topic
// count scale with customer headcount instead of usage (see the same comment in producer.ts).
package topics

import (
	"context"
	"errors"
	"os"
	"strconv"
	"sync"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
)

const (
	defaultPartitions        = 3
	defaultReplicationFactor = 1
)

// Creator is the narrow slice of admin behaviour Ensurer needs. It exists so the ensure/cache logic
// is unit-testable without a broker — the kadm-backed implementation is KadmCreator below.
type Creator interface {
	CreateTopic(ctx context.Context, topic string, partitions int32, replicationFactor int16) error
}

// Ensurer creates each topic once per process. Concurrent publishes for the same new topic are
// serialised, so a burst of telemetry from one tenant issues a single CreateTopics call.
type Ensurer struct {
	creator           Creator
	partitions        int32
	replicationFactor int16

	mu    sync.Mutex
	known map[string]struct{}
}

// NewEnsurer reads KAFKA_TOPIC_PARTITIONS / KAFKA_TOPIC_REPLICATION_FACTOR, defaulting to the same
// 3 / 1 the TypeScript producer uses so a topic has identical geometry whichever side creates it.
func NewEnsurer(creator Creator) *Ensurer {
	return &Ensurer{
		creator:           creator,
		partitions:        int32(envInt("KAFKA_TOPIC_PARTITIONS", defaultPartitions)),
		replicationFactor: int16(envInt("KAFKA_TOPIC_REPLICATION_FACTOR", defaultReplicationFactor)),
	}
}

// Ensure creates topic unless this process already created (or observed) it.
//
// An error is returned, never swallowed: publishing to a topic that does not exist would fail
// anyway, and the caller decides whether to drop the message or retry. A topic that already exists
// is success — CreateTopic treats TOPIC_ALREADY_EXISTS as nil, so two workers racing on a tenant's
// first message are both fine.
func (e *Ensurer) Ensure(ctx context.Context, topic string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if _, seen := e.known[topic]; seen {
		return nil
	}
	if err := e.creator.CreateTopic(ctx, topic, e.partitions, e.replicationFactor); err != nil {
		return err
	}
	if e.known == nil {
		e.known = make(map[string]struct{})
	}
	e.known[topic] = struct{}{}
	return nil
}

// KadmCreator is the real Creator, backed by franz-go's admin client.
type KadmCreator struct {
	admin *kadm.Client
}

// NewKadmCreator wraps an existing kgo client — it does not open a second connection to the broker.
func NewKadmCreator(cl *kgo.Client) *KadmCreator {
	return &KadmCreator{admin: kadm.NewClient(cl)}
}

// CreateTopic issues CreateTopics and folds TOPIC_ALREADY_EXISTS into success (idempotent).
func (k *KadmCreator) CreateTopic(ctx context.Context, topic string, partitions int32, replicationFactor int16) error {
	resp, err := k.admin.CreateTopics(ctx, partitions, replicationFactor, nil, topic)
	if err != nil {
		return err
	}
	return foldCreateResponses(resp)
}

// foldCreateResponses turns per-topic results into a single error, treating TOPIC_ALREADY_EXISTS as
// success so two workers racing on a tenant's first message both succeed. Split out from
// CreateTopic so the decision logic is unit-testable without a live broker.
func foldCreateResponses(resp kadm.CreateTopicResponses) error {
	for _, r := range resp {
		if r.Err != nil && !errors.Is(r.Err, kerr.TopicAlreadyExists) {
			return r.Err
		}
	}
	return nil
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
