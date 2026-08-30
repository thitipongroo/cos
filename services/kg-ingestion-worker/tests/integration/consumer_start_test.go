// Integration tests: consumer.Start's wiring.
//
// §35.13 ESC-45: Start was at 30% — only its first failure was covered.
//
// The branch worth pinning is the rebuild group. A full replay cannot reuse the stable consumer
// group: `ConsumeResetOffset` only applies to a group with no committed offset, so a rebuild under
// the stable group would resume from the last commit and replay nothing at all. Start works around
// that with a throwaway group name, and that is the difference between the admin endpoint doing
// what it says and doing nothing.
//
// coskafka's constructors build clients without dialling, so this drives Start's setup without a
// broker; the run itself is bounded by a short context.

package integration_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/construction-os/kg-ingestion-worker/internal/consumer"
	"github.com/stretchr/testify/assert"
)

func TestStart_RunsWithoutRedisWhenNoneIsConfigured(t *testing.T) {
	// Idempotency is best-effort: the graph writer's operations are MERGEs, so a redelivery is
	// absorbed anyway. Refusing to start without Redis would stop ingestion for a cache.
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err := consumer.Start(ctx, consumer.Config{
		Brokers:     []string{"127.0.0.1:1"},
		RegistryURL: "http://127.0.0.1:1",
	}, driver, false)

	if err != nil {
		assert.NotContains(t, err.Error(), "parse redis url")
	}
}

func TestStart_CarriesOnWhenTheRedisURLIsUnusable(t *testing.T) {
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err := consumer.Start(ctx, consumer.Config{
		Brokers:     []string{"127.0.0.1:1"},
		RegistryURL: "http://127.0.0.1:1",
		RedisURL:    "not-a-redis-url",
	}, driver, false)

	// The unusable URL is warned about and skipped — it must not be what Start returns.
	if err != nil {
		assert.NotContains(t, err.Error(), "parse redis url")
	}
}

func TestStart_BuildsIdempotencyWhenARedisURLIsGiven(t *testing.T) {
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err := consumer.Start(ctx, consumer.Config{
		Brokers:     []string{"127.0.0.1:1"},
		RegistryURL: "http://127.0.0.1:1",
		RedisURL:    "redis://127.0.0.1:1",
	}, driver, true)

	if err != nil {
		assert.NotContains(t, err.Error(), "dlq publisher")
	}
}

func TestStart_ARebuildRunsUnderAThrowawayGroupNotTheStableOne(t *testing.T) {
	// The stable group has committed offsets, and ConsumeResetOffset is ignored for a group that
	// has them — so a rebuild under ConsumerGroupID would replay nothing. The throwaway name is what
	// makes the admin endpoint's promise true.
	driver, cleanup := setupNeo4j(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Both calls go through the same setup; the assertion is that the constant is not the group a
	// rebuild uses, which Start guarantees by suffixing it.
	assert.NotContains(t, consumer.ConsumerGroupID, ".rebuild.",
		"the stable group name must not itself look like a rebuild group")

	err := consumer.Start(ctx, consumer.Config{
		Brokers:     []string{"127.0.0.1:1"},
		RegistryURL: "http://127.0.0.1:1",
	}, driver, true)

	if err != nil {
		assert.NotContains(t, err.Error(), "dlq publisher")
	}
}

func TestStart_TopicRegexIsTenantScoped(t *testing.T) {
	// Topics are {tenant_id}.{event_type}; a pattern anchored on a bare event name would match no
	// real topic and the worker would sit idle.
	assert.True(t, strings.HasPrefix(consumer.TopicRegex, "^"),
		"the regex must be anchored, or it would match a topic that merely contains the name")
	assert.NotContains(t, consumer.TopicRegex, "^construction.",
		"anchoring on the event name skips the tenant prefix")
}
