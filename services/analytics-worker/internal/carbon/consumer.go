// Carbon analytics module — Phase 24
// Consumes: {tenant_id}.carbon.record.created.v1  (Confluent-framed Avro)
// Produces: INSERT to ClickHouse (analytics.carbon_records)
// GHG Protocol Scope 3 (embodied carbon, EN 15804 modules A1–A3); Source: spec §33.3, §33.4
//
// Decoding, the §7.3 tenant guard, idempotency, retry and DLQ all live in the shared coskafka module (libs/go/coskafka); this
// file is only the carbon-specific handler and its ClickHouse write.
package carbon

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/construction-os/coslib/coskafka"
)

const (
	// TopicRegex matches the tenant-scoped topic for this event. Topics are
	// {tenant_id}.{domain}.{entity}.{action}.{version} (packages/@cos/kafka/src/topic-catalog.ts),
	// so a bare event name never matches a real topic — sarama treats a leading ^ as a pattern.
	TopicRegex = `^[^.]+\.carbon\.record\.created\.v1$`

	// ConsumerGroup follows the §7.3 shared-tier convention {service_name}.shared.
	ConsumerGroup = "analytics-worker.shared"

	// §33.4 GHG Protocol: embodied carbon in materials (A1–A3) is Scope 3. The producer stamps this
	// on every record; kept as a constant so a missing/blank value still lands correctly typed.
	scopeEmbodiedMaterials = "SCOPE_3"
)

// CarbonRecordPayload is the `payload` of carbon.record.created.v1.
//
// The decimal fields are strings, not float64: they originate from Postgres DECIMAL columns, are
// declared `string` in carbon.record.created.v1.avsc, and land in ClickHouse Decimal columns.
// Routing audited emissions data through a binary float would introduce drift that §33.4's audit
// trail cannot tolerate.
type CarbonRecordPayload struct {
	CarbonRecordID     string `json:"carbon_record_id"`
	ProjectID          string `json:"project_id"`
	ConsumptionID      string `json:"consumption_id"`
	MaterialID         string `json:"material_id"`
	QuantityConsumed   string `json:"quantity_consumed"`
	Unit               string `json:"unit"`
	CarbonFactor       string `json:"carbon_factor"`        // kgCO₂e per declared unit
	CarbonFactorSource string `json:"carbon_factor_source"` // EPD reference (§33.4 audit trail)
	CarbonKgco2e       string `json:"carbon_kgco2e"`        // quantity_consumed × carbon_factor
	GHGScope           string `json:"ghg_scope"`            // "SCOPE_1" | "SCOPE_2" | "SCOPE_3"
	RecordedAt         string `json:"recorded_at"`
}

// Writer persists a decoded carbon record.
type Writer struct {
	clickhouse *sql.DB
	logger     *slog.Logger
}

// NewWriter builds the carbon handler's ClickHouse side.
func NewWriter(clickhouse *sql.DB) *Writer {
	return &Writer{
		clickhouse: clickhouse,
		logger:     slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("component", "carbon-writer"),
	}
}

// Handle is the coskafka.Handler for carbon.record.created.v1.
//
// Returning an error hands control back to the pipeline's retry/DLQ logic — so a ClickHouse blip
// is retried rather than silently dropped, which is what the previous implementation did.
func (w *Writer) Handle(ctx context.Context, envelope *coskafka.EventEnvelope) error {
	var payload CarbonRecordPayload
	if err := json.Unmarshal(envelope.Payload, &payload); err != nil {
		return fmt.Errorf("unmarshal carbon payload: %w", err)
	}

	// recorded_at arrives as RFC 3339 with a trailing Z. ClickHouse cannot cast that string into
	// DateTime64(3,'UTC') — it stops at the offset designator ("syntax error at position 23") — so
	// parse it here and hand the driver a time.Time instead of letting SQL do the conversion.
	recordedAt, err := time.Parse(time.RFC3339, payload.RecordedAt)
	if err != nil {
		return fmt.Errorf("parse recorded_at %q: %w", payload.RecordedAt, err)
	}

	scope := resolveScope(payload.GHGScope)
	if err := w.insert(ctx, envelope.TenantID, &payload, scope, recordedAt); err != nil {
		return fmt.Errorf("clickhouse insert: %w", err)
	}

	w.logger.Info("carbon record aggregated",
		"carbon_record_id", payload.CarbonRecordID,
		"project_id", payload.ProjectID,
		"carbon_kgco2e", payload.CarbonKgco2e,
		"ghg_scope", scope,
	)
	return nil
}

// resolveScope defaults a blank GHG scope to Scope 3.
//
// Every producer today is material consumption, which §33.4 classifies as Scope 3 (embodied carbon,
// A1–A3). Defaulting rather than rejecting keeps an older producer's records queryable, while an
// explicit SCOPE_1/SCOPE_2 from a future equipment or electricity producer passes through untouched.
func resolveScope(scope string) string {
	if scope == "" {
		return scopeEmbodiedMaterials
	}
	return scope
}

func (w *Writer) insert(
	ctx context.Context,
	tenantID string,
	payload *CarbonRecordPayload,
	scope string,
	recordedAt time.Time,
) error {
	_, err := w.clickhouse.ExecContext(ctx, `
		INSERT INTO analytics.carbon_records
		  (carbon_record_id, tenant_id, project_id, consumption_id, material_id,
		   quantity_consumed, unit, carbon_factor, carbon_factor_source,
		   carbon_kgco2e, ghg_scope, recorded_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		payload.CarbonRecordID,
		tenantID,
		payload.ProjectID,
		payload.ConsumptionID,
		payload.MaterialID,
		payload.QuantityConsumed,
		payload.Unit,
		payload.CarbonFactor,
		payload.CarbonFactorSource,
		payload.CarbonKgco2e,
		scope,
		recordedAt,
	)
	return err
}

// Config carries the endpoints Start needs.
type Config struct {
	Brokers     []string
	RegistryURL string
	RedisURL    string
}

// Start runs the carbon consumer group until ctx is cancelled.
func Start(ctx context.Context, cfg Config, clickhouse *sql.DB) error {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("component", "carbon-consumer")

	dlq, err := coskafka.NewDLQPublisher(cfg.Brokers)
	if err != nil {
		return fmt.Errorf("dlq publisher: %w", err)
	}
	defer func() { _ = dlq.Close() }()

	// Idempotency is best-effort at startup: without Redis the consumer still runs, it just cannot
	// dedupe redelivered messages. The carbon insert is guarded by a unique index on
	// consumption_id in Postgres and ReplacingMergeTree in ClickHouse, so a duplicate is absorbed.
	var idem *coskafka.Idempotency
	if cfg.RedisURL != "" {
		idem, err = coskafka.NewIdempotency(cfg.RedisURL)
		if err != nil {
			logger.Warn("redis unavailable — running without idempotency", "error", err)
		} else {
			defer func() { _ = idem.Close() }()
		}
	}

	writer := NewWriter(clickhouse)
	consumer := coskafka.NewConsumer(
		coskafka.NewDecoder(cfg.RegistryURL),
		dlq,
		idem,
		writer.Handle,
		logger,
	)

	return consumer.Run(ctx, cfg.Brokers, ConsumerGroup, TopicRegex)
}
