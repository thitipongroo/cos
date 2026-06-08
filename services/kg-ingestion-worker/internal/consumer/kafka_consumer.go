// Sarama consumer group handler for kg-ingestion-worker.
// Subscribes to all tenant-scoped construction/procurement/site/finance events
// using a cross-tenant regex pattern per spec §Phase 13 NE-1 fix.
// Source: context/00_master_construction_os.md §Phase 13
package consumer

import (
	"context"
	"encoding/json"
	"log"

	"github.com/IBM/sarama"
	"github.com/construction-os/kg-ingestion-worker/internal/graph"
	"github.com/construction-os/kg-ingestion-worker/internal/mapper"
	"github.com/construction-os/kg-ingestion-worker/internal/model"
	neo4j "github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// TopicRegex matches all tenant-scoped topics for the four consumed domains.
// Format: {tenant_id}.{domain}.{entity}.{action}.{version}
// Source: docs/specifications/07-multi-tenant-architecture §7.3 + §Phase 13 NE-1/NE-4 fixes.
const TopicRegex = `^[^.]+\.(construction|procurement|site|finance)\..*`

// ConsumerGroupID is the Kafka consumer group name per spec §Phase 13.
const ConsumerGroupID = "kg-consumer-group"

// KGConsumerHandler implements sarama.ConsumerGroupHandler.
type KGConsumerHandler struct {
	driver neo4j.DriverWithContext
}

func NewKGConsumerHandler(driver neo4j.DriverWithContext) *KGConsumerHandler {
	return &KGConsumerHandler{driver: driver}
}

func (h *KGConsumerHandler) Setup(_ sarama.ConsumerGroupSession) error   { return nil }
func (h *KGConsumerHandler) Cleanup(_ sarama.ConsumerGroupSession) error { return nil }

func (h *KGConsumerHandler) ConsumeClaim(sess sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for msg := range claim.Messages() {
		if err := h.processMessage(sess.Context(), msg); err != nil {
			log.Printf("kg-consumer: error processing topic=%s offset=%d: %v", msg.Topic, msg.Offset, err)
			// log and continue — do not stop the consumer on a single bad message
		}
		sess.MarkMessage(msg, "")
	}
	return nil
}

func (h *KGConsumerHandler) processMessage(ctx context.Context, msg *sarama.ConsumerMessage) error {
	var env model.EventEnvelope
	if err := json.Unmarshal(msg.Value, &env); err != nil {
		log.Printf("kg-consumer: malformed envelope topic=%s: %v", msg.Topic, err)
		return nil // skip malformed messages
	}

	ops, err := mapper.MapEvent(&env)
	if err != nil {
		log.Printf("kg-consumer: mapper error event_type=%s: %v", env.EventType, err)
		return nil // skip unmappable payloads
	}
	if len(ops) == 0 {
		return nil // unhandled event type — skip silently
	}

	return graph.ExecuteOperations(ctx, h.driver, ops)
}

// StartConsumerGroup starts the Sarama consumer group and blocks until ctx is cancelled.
// resetOffset: if true, seek to OffsetOldest for full rebuild.
func StartConsumerGroup(ctx context.Context, brokers []string, driver neo4j.DriverWithContext, resetOffset bool) error {
	cfg := sarama.NewConfig()
	cfg.Version = sarama.V3_0_0_0
	if resetOffset {
		cfg.Consumer.Offsets.Initial = sarama.OffsetOldest
	} else {
		cfg.Consumer.Offsets.Initial = sarama.OffsetNewest
	}
	cfg.Consumer.Group.Rebalance.GroupStrategies = []sarama.BalanceStrategy{sarama.NewBalanceStrategyRoundRobin()}

	group, err := sarama.NewConsumerGroup(brokers, ConsumerGroupID, cfg)
	if err != nil {
		return err
	}
	defer group.Close()

	handler := NewKGConsumerHandler(driver)

	for {
		if err := group.Consume(ctx, nil, handler); err != nil {
			return err
		}
		if ctx.Err() != nil {
			return nil
		}
	}
}

// StartConsumerGroupWithRegex starts a consumer using topic regex subscription.
// sarama.NewConsumerGroup with topic patterns uses the regex consumer API.
func StartConsumerGroupWithRegex(ctx context.Context, brokers []string, driver neo4j.DriverWithContext, resetOffset bool) error {
	cfg := sarama.NewConfig()
	cfg.Version = sarama.V3_0_0_0
	if resetOffset {
		cfg.Consumer.Offsets.Initial = sarama.OffsetOldest
	} else {
		cfg.Consumer.Offsets.Initial = sarama.OffsetNewest
	}
	cfg.Consumer.Group.Rebalance.GroupStrategies = []sarama.BalanceStrategy{sarama.NewBalanceStrategyRoundRobin()}

	group, err := sarama.NewConsumerGroup(brokers, ConsumerGroupID, cfg)
	if err != nil {
		return err
	}
	defer group.Close()

	handler := NewKGConsumerHandler(driver)
	// Pass the regex as the single topic string — sarama treats strings starting with ^ as regex
	topics := []string{TopicRegex}

	for {
		if err := group.Consume(ctx, topics, handler); err != nil {
			return err
		}
		if ctx.Err() != nil {
			return nil
		}
	}
}
