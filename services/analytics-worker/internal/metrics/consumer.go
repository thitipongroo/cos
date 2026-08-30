// Phase 14 analytics ingestion — Kafka → ClickHouse aggregate tables.
//
// WHY THIS EXISTS INSTEAD OF THE CLICKHOUSE KAFKA ENGINE. The Phase 14 DDL created eight Kafka
// engine tables feeding ten materialized views, each subscribing to a bare event name such as
// `construction.project.created`. Real topics are `{tenant_id}.{event_type}` with a `.v1` suffix
// (packages/@cos/kafka/src/topic-catalog.ts, topicForEvent) — the same reason the carbon
// consumer next door carries `^[^.]+\.carbon\.record\.created\.v1$` and says outright that "a bare
// event name never matches a real topic". `kafka_topic_list` takes literal names, so those eight
// subscriptions matched nothing: the three aggregate tables never received a row and every
// Executive and PM dashboard metric read zero. Nothing failed loudly — the tables existed, the
// consumer groups registered, and the API answered 200 with zeros, which reads as "no data yet".
//
// A single pattern also cannot be expressed there: tenants onboarded later create new topics, and
// only a regex subscription picks them up. So ingestion moves to this worker, which already runs
// that pattern for carbon.
//
// What is preserved: pre-aggregation AT INGESTION, which is what master §Phase 14 requires for the
// P95 SLA. Each handler writes an -State partial aggregate into the AggregatingMergeTree target,
// exactly as the materialized views did, so the query side is unchanged.
package metrics

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/construction-os/coslib/coskafka"
)

const (
	// TopicRegex matches every tenant's topic for the eight events that feed the Phase 14 tables.
	// Anchored at both ends: an unanchored pattern would also match a tenant-prefixed topic of a
	// LATER version (…created.v2) and silently ingest a payload with a different shape.
	TopicRegex = `^[^.]+\.(` +
		`construction\.project\.created|` +
		`procurement\.po\.created|` +
		`procurement\.rfq\.created|` +
		`procurement\.vendor_invoice\.approved|` +
		`site\.report\.submitted|` +
		`site\.issue\.created|` +
		`site\.inspection\.failed|` +
		`workforce\.checkin\.created` +
		`)\.v1$`

	// ConsumerGroup — §7.3 shared-tier convention {service_name}.shared. Distinct from the carbon
	// group so the two subscriptions commit offsets independently.
	ConsumerGroup = "analytics-worker-metrics.shared"
)

// Config mirrors carbon.Config — the same three connection points.
type Config struct {
	Brokers     []string
	RegistryURL string
	RedisURL    string
}

// ── payloads ────────────────────────────────────────────────────────────────────────────────────
//
// Money arrives as a STRING in every event contract (spec 32 §Event payloads) because it originates
// from a Postgres DECIMAL. It is passed to ClickHouse as a string and cast there with
// toDecimal128(...); routing it through a Go float64 would round a value the budget-variance
// threshold is computed from.

type moneyField struct {
	Amount       string `json:"amount"`
	CurrencyCode string `json:"currency_code"`
}

type projectCreatedPayload struct {
	ProjectID string     `json:"project_id"`
	Budget    moneyField `json:"budget"`
}

type poCreatedPayload struct {
	ProjectID   string     `json:"project_id"`
	TotalAmount moneyField `json:"total_amount"`
}

type invoiceApprovedPayload struct {
	ProjectID  string     `json:"project_id"`
	Amount     moneyField `json:"amount"`
	PaymentDue string     `json:"payment_due"`
}

type projectScopedPayload struct {
	ProjectID  string `json:"project_id"`
	ReportDate string `json:"report_date"`
}

// Writer holds the ClickHouse side of the handler.
type Writer struct {
	clickhouse *sql.DB
	logger     *slog.Logger
}

// NewWriter builds the Phase 14 metrics writer.
func NewWriter(clickhouse *sql.DB) *Writer {
	return &Writer{
		clickhouse: clickhouse,
		logger:     slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("component", "metrics-writer"),
	}
}

// eventDate takes the calendar day an event belongs to.
//
// occurred_at is RFC 3339; ClickHouse cannot cast a trailing Z into Date, and the aggregate tables
// are partitioned by toYYYYMM(event_date), so a bad parse would land the row in the wrong partition
// rather than fail.
func eventDate(rfc3339 string) (string, error) {
	ts, err := time.Parse(time.RFC3339, rfc3339)
	if err != nil {
		return "", fmt.Errorf("parse occurred_at %q: %w", rfc3339, err)
	}
	return ts.UTC().Format("2006-01-02"), nil
}

// Handle dispatches one decoded event to the aggregate write it feeds.
//
// Returning an error hands the message back to the pipeline's retry/DLQ path, so a ClickHouse blip
// is retried rather than dropped — the aggregate would otherwise be permanently short by that event
// with nothing to indicate it.
func (w *Writer) Handle(ctx context.Context, envelope *coskafka.EventEnvelope) error {
	// One place, before the dispatch, so every event type is measured and a new case added below
	// cannot forget to. master:4290-4291's freshness budgets are about the pipeline, not about any
	// one handler. See lag.go for exactly which segment of the journey this covers.
	observeLag(envelope.EventType, envelope.OccurredAt, time.Now().UTC())

	switch envelope.EventType {
	case "construction.project.created.v1":
		return w.projectCreated(ctx, envelope)
	case "procurement.po.created.v1":
		return w.poCreated(ctx, envelope)
	case "procurement.rfq.created.v1":
		return w.rfqCreated(ctx, envelope)
	case "procurement.vendor_invoice.approved.v1":
		return w.invoiceApproved(ctx, envelope)
	case "site.report.submitted.v1":
		return w.reportSubmitted(ctx, envelope)
	case "site.issue.created.v1":
		return w.issueCreated(ctx, envelope)
	case "site.inspection.failed.v1":
		return w.inspectionFailed(ctx, envelope)
	case "workforce.checkin.created.v1":
		return w.checkinCreated(ctx, envelope)
	default:
		// The regex admits exactly the eight above. Reaching here means the pattern and this switch
		// disagree, which is worth a log rather than a silent skip.
		w.logger.Warn("unhandled event type on the metrics subscription", "event_type", envelope.EventType)
		return nil
	}
}

// ── project_cost_daily ──────────────────────────────────────────────────────────────────────────

func (w *Writer) projectCreated(ctx context.Context, e *coskafka.EventEnvelope) error {
	var p projectCreatedPayload
	if err := json.Unmarshal(e.Payload, &p); err != nil {
		return fmt.Errorf("unmarshal project.created: %w", err)
	}
	day, err := eventDate(e.OccurredAt)
	if err != nil {
		return err
	}
	// budget_amount is a snapshot, not an aggregate: it is written once per project and read with
	// max(). The two sums contribute an empty state so this row cannot alter them.
	return w.exec(ctx, `
		INSERT INTO analytics.project_cost_daily
		SELECT toUUID(?), toUUID(?), toDate(?),
		       sumState(toDecimal128(0, 4)),
		       sumState(toDecimal128(0, 4)),
		       toDecimal128(?, 4)`,
		e.TenantID, p.ProjectID, day, p.Budget.Amount)
}

func (w *Writer) poCreated(ctx context.Context, e *coskafka.EventEnvelope) error {
	var p poCreatedPayload
	if err := json.Unmarshal(e.Payload, &p); err != nil {
		return fmt.Errorf("unmarshal po.created: %w", err)
	}
	day, err := eventDate(e.OccurredAt)
	if err != nil {
		return err
	}
	// An approved PO is a COMMITMENT, not a cost — it lands in committed_amount and leaves
	// actual_amount alone until an invoice is approved.
	if err := w.exec(ctx, `
		INSERT INTO analytics.project_cost_daily
		SELECT toUUID(?), toUUID(?), toDate(?),
		       sumState(toDecimal128(?, 4)),
		       sumState(toDecimal128(0, 4)),
		       toDecimal128(0, 4)`,
		e.TenantID, p.ProjectID, day, p.TotalAmount.Amount); err != nil {
		return err
	}
	return w.procurementCounts(ctx, e.TenantID, p.ProjectID, day, "po_count", false)
}

func (w *Writer) invoiceApproved(ctx context.Context, e *coskafka.EventEnvelope) error {
	var p invoiceApprovedPayload
	if err := json.Unmarshal(e.Payload, &p); err != nil {
		return fmt.Errorf("unmarshal vendor_invoice.approved: %w", err)
	}
	day, err := eventDate(e.OccurredAt)
	if err != nil {
		return err
	}
	if err := w.exec(ctx, `
		INSERT INTO analytics.project_cost_daily
		SELECT toUUID(?), toUUID(?), toDate(?),
		       sumState(toDecimal128(0, 4)),
		       sumState(toDecimal128(?, 4)),
		       toDecimal128(0, 4)`,
		e.TenantID, p.ProjectID, day, p.Amount.Amount); err != nil {
		return err
	}
	// Overdue is judged at ingestion, as the materialized view did: an invoice that becomes overdue
	// later is not recounted. That approximation is documented in the DDL and kept deliberately —
	// changing it here would make the dashboard disagree with the metric's definition.
	overdue := false
	if p.PaymentDue != "" && p.PaymentDue < day {
		overdue = true
	}
	return w.procurementCounts(ctx, e.TenantID, p.ProjectID, day, "invoice_count", overdue)
}

// ── procurement_activity_daily ──────────────────────────────────────────────────────────────────

func (w *Writer) rfqCreated(ctx context.Context, e *coskafka.EventEnvelope) error {
	var p projectScopedPayload
	if err := json.Unmarshal(e.Payload, &p); err != nil {
		return fmt.Errorf("unmarshal rfq.created: %w", err)
	}
	day, err := eventDate(e.OccurredAt)
	if err != nil {
		return err
	}
	return w.procurementCounts(ctx, e.TenantID, p.ProjectID, day, "rfq_count", false)
}

// procurementCounts writes one row where `owned` carries a real count and every other column
// carries an EMPTY partial state.
//
// countStateIf(1 = 0) is how the materialized views expressed "contribute nothing": the column must
// still be present and correctly typed, or the INSERT is rejected, but it must not add 1 — that is
// what stopped a single PO from being counted as a PO, an RFQ and an invoice at once.
func procurementCountExprs(owned string, overdue bool) []string {
	columns := []string{"po_count", "rfq_count", "invoice_count", "overdue_invoice_count"}
	exprs := make([]string, len(columns))
	for i, col := range columns {
		switch {
		case col == owned:
			exprs[i] = "countState()"
		case col == "overdue_invoice_count" && overdue:
			exprs[i] = "countState()"
		default:
			exprs[i] = "countStateIf(1 = 0)"
		}
	}
	return exprs
}

func (w *Writer) procurementCounts(
	ctx context.Context, tenantID, projectID, day, owned string, overdue bool,
) error {
	exprs := procurementCountExprs(owned, overdue)
	query := fmt.Sprintf(`
		INSERT INTO analytics.procurement_activity_daily
		SELECT toUUID(?), toUUID(?), toDate(?), %s`, strings.Join(exprs, ", "))
	return w.exec(ctx, query, tenantID, projectID, day)
}

// ── site_activity_daily ─────────────────────────────────────────────────────────────────────────

func (w *Writer) reportSubmitted(ctx context.Context, e *coskafka.EventEnvelope) error {
	var p projectScopedPayload
	if err := json.Unmarshal(e.Payload, &p); err != nil {
		return fmt.Errorf("unmarshal report.submitted: %w", err)
	}
	// The report's OWN date, not the moment it was submitted: a report filed the next morning
	// belongs to the day it describes, which is what a daily site trend has to show.
	day := p.ReportDate
	if day == "" {
		var err error
		if day, err = eventDate(e.OccurredAt); err != nil {
			return err
		}
	}
	return w.siteCounts(ctx, e.TenantID, p.ProjectID, day, "report_count")
}

func (w *Writer) issueCreated(ctx context.Context, e *coskafka.EventEnvelope) error {
	return w.siteEvent(ctx, e, "issue_open_count", "site.issue.created")
}

func (w *Writer) inspectionFailed(ctx context.Context, e *coskafka.EventEnvelope) error {
	return w.siteEvent(ctx, e, "inspection_fail_count", "site.inspection.failed")
}

func (w *Writer) checkinCreated(ctx context.Context, e *coskafka.EventEnvelope) error {
	return w.siteEvent(ctx, e, "manpower_total", "workforce.checkin.created")
}

func (w *Writer) siteEvent(
	ctx context.Context, e *coskafka.EventEnvelope, owned, label string,
) error {
	var p projectScopedPayload
	if err := json.Unmarshal(e.Payload, &p); err != nil {
		return fmt.Errorf("unmarshal %s: %w", label, err)
	}
	day, err := eventDate(e.OccurredAt)
	if err != nil {
		return err
	}
	return w.siteCounts(ctx, e.TenantID, p.ProjectID, day, owned)
}

// siteCounts mirrors procurementCounts, but the site table mixes count and sum columns: the two sum
// columns take sumState(toInt32(0)) to contribute nothing, since adding zero cannot change a sum.
func siteCountExprs(owned string) []string {
	kind := map[string]string{
		"report_count":          "count",
		"issue_open_count":      "sum",
		"inspection_fail_count": "count",
		"manpower_total":        "sum",
	}
	order := []string{"report_count", "issue_open_count", "inspection_fail_count", "manpower_total"}
	exprs := make([]string, len(order))
	for i, col := range order {
		switch {
		case col != owned && kind[col] == "count":
			exprs[i] = "countStateIf(1 = 0)"
		case col != owned:
			exprs[i] = "sumState(toInt32(0))"
		case kind[col] == "count":
			exprs[i] = "countState()"
		default:
			// One issue raised, or one worker checked in: +1 on the running total.
			exprs[i] = "sumState(toInt32(1))"
		}
	}
	return exprs
}

func (w *Writer) siteCounts(ctx context.Context, tenantID, projectID, day, owned string) error {
	exprs := siteCountExprs(owned)
	query := fmt.Sprintf(`
		INSERT INTO analytics.site_activity_daily
		SELECT toUUID(?), toUUID(?), toDate(?), %s`, strings.Join(exprs, ", "))
	return w.exec(ctx, query, tenantID, projectID, day)
}

func (w *Writer) exec(ctx context.Context, query string, args ...any) error {
	if _, err := w.clickhouse.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("clickhouse insert: %w", err)
	}
	return nil
}

// Start runs the Phase 14 metrics subscription until ctx is cancelled.
func Start(ctx context.Context, cfg Config, clickhouse *sql.DB) error {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("component", "metrics-consumer")

	dlq, err := coskafka.NewDLQPublisher(cfg.Brokers)
	if err != nil {
		return fmt.Errorf("dlq publisher: %w", err)
	}
	defer func() { _ = dlq.Close() }()

	// Idempotency matters more here than for carbon: AggregatingMergeTree has no dedup of any kind,
	// so a redelivered PO would be counted twice and the committed total would drift upward with
	// nothing to correct it. Without Redis the consumer still runs — degraded, and said so.
	var idem *coskafka.Idempotency
	if cfg.RedisURL != "" {
		idem, err = coskafka.NewIdempotency(cfg.RedisURL)
		if err != nil {
			logger.Warn("redis unavailable — aggregates may double-count a redelivered event", "error", err)
		} else {
			defer func() { _ = idem.Close() }()
		}
	} else {
		logger.Warn("no REDIS_URL — aggregates may double-count a redelivered event")
	}

	consumer := coskafka.NewConsumer(
		coskafka.NewDecoder(cfg.RegistryURL),
		dlq,
		idem,
		NewWriter(clickhouse).Handle,
		logger,
	)
	return consumer.Run(ctx, cfg.Brokers, ConsumerGroup, TopicRegex)
}
