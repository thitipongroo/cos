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

// Idempotency records which event_ids have been processed, so a redelivered message is skipped.
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

// Claim marks an event as being processed and reports whether this caller won the claim.
//
// SET NX is atomic, so two consumer instances racing on the same redelivered message cannot both
// proceed. false means another instance already has it — skip, do not process.
func (i *Idempotency) Claim(ctx context.Context, eventID string) (bool, error) {
	ok, err := i.client.SetNX(ctx, idempotencyKey(eventID), "1", IdempotencyTTL).Result()
	if err != nil {
		return false, fmt.Errorf("redis setnx: %w", err)
	}
	return ok, nil
}

// Release removes the claim so a message parked in the DLQ can be reprocessed after a manual
// replay. Without this, a replayed event would be silently swallowed as a duplicate — the same
// reasoning as the redis.del call on the TypeScript consumer's DLQ path.
func (i *Idempotency) Release(ctx context.Context, eventID string) error {
	if err := i.client.Del(ctx, idempotencyKey(eventID)).Err(); err != nil {
		return fmt.Errorf("redis del: %w", err)
	}
	return nil
}

// idempotencyKey uses the same namespace as the TypeScript consumer so both languages dedupe
// against one keyspace — an event processed by either side is not reprocessed by the other.
func idempotencyKey(eventID string) string {
	return "kafka:processed:" + eventID
}
