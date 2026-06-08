// Carbon analytics module — Phase 24
// Consumes: carbon.record.created.v1
// Produces: INSERT to ClickHouse (carbon_analytics.carbon_records)
// GHG Protocol Scope 1/2/3; Source: spec §33.3, §33.4 CarbonRecord
package carbon

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"

	"github.com/IBM/sarama"
)

const (
	Topic         = "carbon.record.created.v1"
	ConsumerGroup = "analytics-worker-carbon"
)

// CarbonRecordEvent is the Kafka event payload for carbon.record.created.v1.
type CarbonRecordEvent struct {
	EventType          string  `json:"event_type"`
	TenantID           string  `json:"tenant_id"`
	ProjectID          string  `json:"project_id"`
	CarbonRecordID     string  `json:"carbon_record_id"`
	ConsumptionID      string  `json:"consumption_id"`
	MaterialID         string  `json:"material_id"`
	QuantityConsumed   float64 `json:"quantity_consumed"`
	Unit               string  `json:"unit"`
	CarbonFactor       float64 `json:"carbon_factor"`        // kgCO₂e per declared unit
	CarbonFactorSource string  `json:"carbon_factor_source"` // EPD reference
	CarbonKgco2e       float64 `json:"carbon_kgco2e"`        // quantity_consumed × carbon_factor
	RecordedAt         string  `json:"recorded_at"`
	// GHG Protocol scope (Scope 1 / Scope 2 / Scope 3)
	GHGScope string `json:"ghg_scope"` // "SCOPE_1" | "SCOPE_2" | "SCOPE_3"
}

// Consumer implements sarama.ConsumerGroupHandler for carbon.record.created.v1.
type Consumer struct {
	clickhouse *sql.DB
	logger     *slog.Logger
}

func NewConsumer(clickhouse *sql.DB) *Consumer {
	return &Consumer{
		clickhouse: clickhouse,
		logger:     slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("component", "carbon-consumer"),
	}
}

// Setup implements sarama.ConsumerGroupHandler.
func (c *Consumer) Setup(_ sarama.ConsumerGroupSession) error { return nil }

// Cleanup implements sarama.ConsumerGroupHandler.
func (c *Consumer) Cleanup(_ sarama.ConsumerGroupSession) error { return nil }

// ConsumeClaim implements sarama.ConsumerGroupHandler.
func (c *Consumer) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for msg := range claim.Messages() {
		if err := c.process(session.Context(), msg); err != nil {
			c.logger.Error("failed to process carbon record", "error", err, "offset", msg.Offset)
		}
		session.MarkMessage(msg, "")
	}
	return nil
}

func (c *Consumer) process(ctx context.Context, msg *sarama.ConsumerMessage) error {
	var event CarbonRecordEvent
	if err := json.Unmarshal(msg.Value, &event); err != nil {
		return fmt.Errorf("unmarshal: %w", err)
	}

	if err := c.insertToClickHouse(ctx, &event); err != nil {
		return fmt.Errorf("clickhouse insert: %w", err)
	}

	c.logger.Info("carbon record aggregated",
		"carbon_record_id", event.CarbonRecordID,
		"project_id", event.ProjectID,
		"carbon_kgco2e", event.CarbonKgco2e,
		"ghg_scope", event.GHGScope,
	)
	return nil
}

func (c *Consumer) insertToClickHouse(ctx context.Context, event *CarbonRecordEvent) error {
	_, err := c.clickhouse.ExecContext(ctx, `
		INSERT INTO carbon_analytics.carbon_records
		  (carbon_record_id, tenant_id, project_id, consumption_id, material_id,
		   quantity_consumed, unit, carbon_factor, carbon_factor_source,
		   carbon_kgco2e, ghg_scope, recorded_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		event.CarbonRecordID,
		event.TenantID,
		event.ProjectID,
		event.ConsumptionID,
		event.MaterialID,
		event.QuantityConsumed,
		event.Unit,
		event.CarbonFactor,
		event.CarbonFactorSource,
		event.CarbonKgco2e,
		event.GHGScope,
		event.RecordedAt,
	)
	return err
}
