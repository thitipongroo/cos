package coskafka

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// IdempotencyTTL matches IDEMPOTENCY_TTL_SECONDS in @cos/kafka/src/consumer.ts. Kafka
// retention for the shared tier is 7 days (§7.3), so 24h covers redelivery without holding keys
// for the whole retention window.
const IdempotencyTTL = 24 * time.Hour

// Idempotency records which event_ids a CONSUMER GROUP has processed, so a redelivered message is
// skipped by that group — and only by that group.
type Idempotency struct {
	client *redis.Client
}

// NewIdempotency dials Redis. url is a redis:// connection string.
func NewIdempotency(url string) (*Idempotency, error) {
	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	return &Idempotency{client: redis.NewClient(opts)}, nil
}

// Close releases the Redis connection.
func (i *Idempotency) Close() error { return i.client.Close() }

// Claim marks an event as being processed by group and reports whether this caller won the claim.
//
// SET NX is atomic, so two consumer instances in the SAME group racing on the same redelivered
// message cannot both proceed. false means another instance of that group already has it — skip, do
// not process. An instance of a DIFFERENT group is unaffected: it has its own key.
func (i *Idempotency) Claim(ctx context.Context, group, eventID string) (bool, error) {
	ok, err := i.client.SetNX(ctx, idempotencyKey(group, eventID), "1", IdempotencyTTL).Result()
	if err != nil {
		return false, fmt.Errorf("redis setnx: %w", err)
	}
	return ok, nil
}

// Release removes the claim so a message parked in the DLQ can be reprocessed after a manual
// replay. Without this, a replayed event would be silently swallowed as a duplicate — the same
// reasoning as the redis.del call on the TypeScript consumer's DLQ path.
func (i *Idempotency) Release(ctx context.Context, group, eventID string) error {
	if err := i.client.Del(ctx, idempotencyKey(group, eventID)).Err(); err != nil {
		return fmt.Errorf("redis del: %w", err)
	}
	return nil
}

// idempotencyKey uses the same layout as the TypeScript consumer (@cos/kafka/src/consumer.ts)
// so a group behaves identically whichever language implements it.
//
// The group is IN the key. Before 2026-08-23 it was not, and this comment claimed the resulting
// collision was the point — "an event processed by either side is not reprocessed by the other".
// That is only correct when the two sides are the same consumer group. Across groups it is not
// deduplication, it is dropping: whichever group reached SET NX first claimed the event and every
// other subscriber skipped it at DEBUG level. Eight event types have two or three subscribing groups
// (TDD OQ-49).
func idempotencyKey(group, eventID string) string {
	return "kafka:processed:" + group + ":" + eventID
}
