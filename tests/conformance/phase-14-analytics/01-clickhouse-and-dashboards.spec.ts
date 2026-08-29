/**
 * Phase 14 — the analytics store, its ingestion, and the dashboard APIs (master:4237-4339).
 */
import * as fs from 'fs';
import * as path from 'path';
import { read, readYaml, repoRoot } from '../helpers';

const ddlDir = 'infrastructure/clickhouse/initdb.d';
/** SQL with `--` comments removed: a header that NAMES TTL or kafka_topic_list is not one. */
const sqlOnly = (body: string): string => body.replace(/--[^\n]*/g, ' ');

const aggregates = sqlOnly(read(`${ddlDir}/03-aggregation-tables.sql`));
const service = read('backend/src/modules/analytics/analytics.service.ts');
const worker = read('services/analytics-worker/internal/metrics/consumer.go');

const TABLES = ['project_cost_daily', 'procurement_activity_daily', 'site_activity_daily'];

describe('Phase 14 · ClickHouse (master:4248-4265, 4322)', () => {
  it('runs the version the spec pins', () => {
    expect(read('docker-compose.yml')).toMatch(/clickhouse\/clickhouse-server:26\./);
  });

  it.each(TABLES)('%s is an AggregatingMergeTree', (table) => {
    // "Materialized views: pre-aggregate metrics at ingestion time (NOT query-time aggregation —
    // ensures P95 SLA is met)". A plain MergeTree would push the aggregation into every dashboard
    // request, which is the SLA this engine choice exists to protect.
    const block = aggregates.slice(aggregates.indexOf(`analytics.${table}`));
    expect(block).toMatch(/ENGINE = AggregatingMergeTree/);
  });

  it.each(TABLES)('%s partitions by toYYYYMM(event_date)', (table) => {
    const block = aggregates.slice(aggregates.indexOf(`analytics.${table}`));
    expect(block.slice(0, 1200)).toMatch(/PARTITION BY toYYYYMM\(event_date\)/);
  });

  it('holds no raw-event table (master:4253-4254)', () => {
    // "ClickHouse holds pre-aggregated metrics only — there is no raw-event fact table here." Raw
    // retention is the Iceberg lake's job; a fact table here would silently become a second,
    // unbounded copy with no TTL to trim it.
    const all = sqlOnly(
      fs
        .readdirSync(path.join(repoRoot, ddlDir))
        .filter((f) => f.endsWith('.sql'))
        .map((f) => read(`${ddlDir}/${f}`))
        .join('\n'),
    );
    expect(all).not.toMatch(/CREATE TABLE[^;]*_(raw|events|fact)\b/i);
  });

  it('sets no TTL on the aggregate tables (master:4260)', () => {
    // Deliberate: the aggregates are indefinite. A TTL here would quietly delete the only copy of
    // a metric's history, since the raw events it was built from live only for the Kafka window
    // until the Data Lake lands.
    expect(aggregates).not.toMatch(/\bTTL\b/);
  });

  it('uses ReplacingMergeTree only for carbon (master:4257)', () => {
    expect(read(`${ddlDir}/05-carbon-tables.sql`)).toMatch(/ReplacingMergeTree/);
    expect(aggregates).not.toMatch(/ReplacingMergeTree/);
  });

  it.each([
    ['project_cost_daily', ['committed_amount', 'actual_amount', 'budget_amount']],
    [
      'procurement_activity_daily',
      ['po_count', 'rfq_count', 'invoice_count', 'overdue_invoice_count'],
    ],
    [
      'site_activity_daily',
      ['report_count', 'issue_open_count', 'inspection_fail_count', 'manpower_total'],
    ],
  ])('%s declares the columns master lists', (table, columns) => {
    const block = aggregates.slice(
      aggregates.indexOf(`analytics.${table}`),
      aggregates.indexOf(`ORDER BY`, aggregates.indexOf(`analytics.${table}`)),
    );
    for (const column of columns) expect(block).toContain(column);
  });

  it('keeps money as Decimal(19,4), never a float', () => {
    expect(aggregates).toMatch(/AggregateFunction\(sum, Decimal\(19,4\)\)/);
    expect(aggregates).not.toMatch(/Float(32|64)/);
  });
});

describe('Phase 14 · ingestion reaches the tables (master:4250)', () => {
  it('subscribes to tenant-prefixed, versioned topics', () => {
    // The failure this replaced: eight Kafka engine tables subscribed to bare names like
    // 'construction.project.created', while real topics are '{tenant_id}.…​.v1'. Nothing matched,
    // so the aggregates stayed empty and every dashboard read zero — with no error anywhere.
    expect(worker).toMatch(/TopicRegex = `\^\[\^\.\]\+\\\.\(/);
    expect(worker).toMatch(/\)\\\.v1\$`/);
  });

  it('covers all eight events the three tables are built from', () => {
    for (const event of [
      'construction\\.project\\.created',
      'procurement\\.po\\.created',
      'procurement\\.rfq\\.created',
      'procurement\\.vendor_invoice\\.approved',
      'site\\.report\\.submitted',
      'site\\.issue\\.created',
      'site\\.inspection\\.failed',
      'workforce\\.checkin\\.created',
    ]) {
      expect(worker).toContain(event);
    }
  });

  it('still pre-aggregates at ingestion rather than at query time', () => {
    // The engine choice only pays off if the writer inserts partial states.
    expect(worker).toMatch(/sumState\(/);
    expect(worker).toMatch(/countState\(\)/);
  });

  it('writes an EMPTY state into columns the event does not own', () => {
    // countStateIf(1 = 0) and sumState(toInt32(0)). Without them one purchase order would raise
    // po_count, rfq_count and invoice_count together.
    expect(worker).toMatch(/countStateIf\(1 = 0\)/);
    expect(worker).toMatch(/sumState\(toInt32\(0\)\)/);
  });

  it('no ClickHouse Kafka engine table remains', () => {
    const all = sqlOnly(
      fs
        .readdirSync(path.join(repoRoot, ddlDir))
        .filter((f) => f.endsWith('.sql'))
        .map((f) => read(`${ddlDir}/${f}`))
        .join('\n'),
    );
    expect(all).not.toMatch(/ENGINE = Kafka/);
    expect(all).not.toMatch(/kafka_topic_list/);
  });
});

describe('Phase 14 · caching (master:4294-4298, 4326)', () => {
  it('uses the cache key format the spec fixes', () => {
    expect(service).toMatch(
      /`analytics:\$\{tenantId\}:\$\{dashboardType\}:\$\{projectId\}:\$\{dateRange\}`/,
    );
  });

  it('caches for five minutes', () => {
    // Layer 1, TTL 5 minutes — inside the 15-minute freshness budget master:4245 allows. The value
    // is set where the cache is CONSTRUCTED, not in the service that reads it.
    expect(read('backend/src/modules/analytics/analytics.module.ts')).toMatch(
      /CACHE_TTL_MS = 5 \* 60 \* 1000/,
    );
  });

  it('invalidates on event, not only on expiry', () => {
    // "Cache invalidation: event-driven (on relevant Kafka event, clear Redis cache key)". With TTL
    // alone a dashboard can show a figure five minutes after the transaction that changed it.
    expect(service).toMatch(/invalidate|del\(/i);
  });
});

describe('Phase 14 · dashboards and their APIs (master:4300-4318, 4325)', () => {
  const controllers = ['executive', 'pm', 'trends'].map((c) =>
    read(`backend/src/modules/analytics/analytics.${c}.controller.ts`),
  );
  const all = controllers.join('\n');

  it.each([
    ['executive', "@Get('executive')"],
    ['pm', "@Get('pm/:projectId')"],
    ['cost trend', "@Get('cost-trend')"],
    ['procurement trend', "@Get('procurement-trend')"],
    ['site trend', "@Get('site-trend')"],
  ])('exposes the %s endpoint', (_name, decorator) => {
    expect(all).toContain(decorator);
  });

  it('queries ClickHouse through clickhouse-js', () => {
    expect(read('backend/src/modules/analytics/analytics.module.ts')).toMatch(
      /from '@clickhouse\/client'/,
    );
  });

  it('treats the at-risk variance threshold as configurable (master:4303)', () => {
    // "variance > 10% from budget — threshold is configurable". A literal 10 in the SQL would make
    // the number un-tunable per tenant, and the same figure is already tenant-overridable for the
    // finance variance alert.
    expect(service).toMatch(/riskThresholdPct\s*=\s*10/);
    expect(service).toMatch(/\{riskThreshold:Float64\}/);
  });

  it('has an OpenAPI document covering every route', () => {
    const doc = readYaml<{ paths: Record<string, unknown> }>('docs/api/analytics.openapi.yaml');
    const documented = Object.keys(doc.paths ?? {});
    const routes = [...all.matchAll(/@Get\('([^']*)'\)/g)].map((m) => m[1]!);
    for (const route of routes) {
      const normalised = route.replace(/:(\w+)/g, '{$1}');
      expect(documented.some((p) => p.includes(normalised.split('/')[0]!))).toBe(true);
    }
  });
});

describe('Phase 14 · the topic documentation matches the code', () => {
  it('topics.yaml states the per-tenant naming the platform actually uses', () => {
    // It states a naming scheme and nothing applies it — which is exactly how the ClickHouse DDL
    // came to subscribe to names no producer creates.
    const topics = read('infrastructure/kafka/topics.yaml');
    expect(topics).toMatch(/\{tenant_id\}\.\{domain\}\.\{entity\}\.\{action\}\.v\{N\}/);
    expect(topics).not.toMatch(/^# Topic naming: \{service\}\.\{entity\}\.\{event\}$/m);
  });
});

/**
 * The performance SLA (master:4287-4291).
 *
 * Four numbers are stated. Before 2026-08-29 exactly one of them was enforced, and one of the other
 * three was enforced at the WRONG value — which is worse, because a green run reads as coverage:
 *
 *   Executive P95 < 3s   enforced (load test + AnalyticsSLABreach)
 *   PM P95 < 2s          "enforced" at 3s in BOTH places, so a 2.9s PM dashboard passed the load
 *                        test and paged nobody, missing its own budget by 45%
 *   freshness 15 min     nothing measures it — see the case at the end of this block
 *   real-time < 30s      likewise
 *
 * These cases read the k6 script and the Prometheus rules as text on purpose. Both are configuration
 * that no test executes: k6 runs on demand in CI's load stage, and an alert expression is only ever
 * evaluated by a Prometheus that is not running here. A wrong number in either is invisible until
 * the day it matters, which is the day it is too late.
 */
describe('Phase 14 · the two dashboard latency budgets are enforced separately (master:4288-4289)', () => {
  const loadtest = read('tests/load/dashboard-sla.js');
  const alerts = read('infrastructure/monitoring/prometheus/rules/cos-alerts.yml');

  it('the load test holds the PM endpoint to 2s, not 3s', () => {
    expect(loadtest).toMatch(/'http_req_duration\{endpoint:pm\}':\s*\['p\(95\)<2000'\]/);
  });

  it('the load test still allows the executive endpoint its 3s', () => {
    // The budgets differ; collapsing them in either direction is the bug. Tightening executive to
    // 2s would fail a dashboard that is within spec.
    expect(loadtest).toMatch(/'http_req_duration\{endpoint:executive\}':\s*\['p\(95\)<3000'\]/);
  });

  it('the trend endpoints are held to the PM budget', () => {
    // They back the PM dashboard's charts (master:4352-4356). A 2.9s trend query makes a 2s PM
    // dashboard impossible however fast the page's own query is.
    for (const ep of ['cost-trend', 'procurement-trend', 'site-trend']) {
      expect(loadtest).toMatch(
        new RegExp(`'http_req_duration\\{endpoint:${ep}\\}':\\s*\\['p\\(95\\)<2000'\\]`),
      );
    }
  });

  it('runs the load at the 100 concurrent users master:4376 names', () => {
    expect(loadtest).toMatch(/target:\s*100/);
  });

  it('a Prometheus rule pages on the PM budget at 2s', () => {
    expect(alerts).toContain('alert: AnalyticsPMSLABreach');
    const rule = alerts.slice(alerts.indexOf('alert: AnalyticsPMSLABreach'));
    expect(rule.slice(0, rule.indexOf('labels:'))).toMatch(/\)\s*>\s*2\b/);
  });

  it('the 3s rule no longer swallows the PM paths', () => {
    // Without the exclusion, the PM paths match BOTH rules and the looser one makes the tighter one
    // decorative: the 3s rule stays quiet at 2.9s and the reader sees a rule named for analytics
    // that is silent.
    const rule = alerts.slice(alerts.indexOf('alert: AnalyticsSLABreach'));
    expect(rule.slice(0, rule.indexOf('labels:'))).toMatch(
      /path!~"\/api\/v1\/analytics\/\(pm\|projects\)/,
    );
  });

  it('measures pipeline freshness rather than only stating it (master:4290-4291)', () => {
    // Replaced on 2026-08-29. The case that stood here recorded the ABSENCE of a measurement and
    // justified it with a claim that was wrong: that analytics-worker "registers no Prometheus
    // collector at all, so an alert would reference a series that never exists". The worker has
    // served /metrics on :9464 since cosotel.Start was added, and prometheus.yml has scraped it all
    // along — what was missing was the series, not the endpoint. The plumbing being present is what
    // made this a small change rather than the infrastructure project the old comment implied.
    const lag = read('services/analytics-worker/internal/metrics/lag.go');
    expect(lag).toContain('analytics_ingestion_lag_seconds');
    // Measured where every event passes, before the per-type dispatch, so a handler added later
    // cannot forget it.
    expect(read('services/analytics-worker/internal/metrics/consumer.go')).toMatch(
      /observeLag\(envelope\.EventType[\s\S]{0,80}switch envelope\.EventType/,
    );
  });

  it('alerts on both freshness budgets separately (master:4290-4291)', () => {
    // 15 minutes and 30 seconds are different budgets on the same measurement — the same shape as
    // the two dashboard SLAs above. One rule cannot serve both: at 900s it stays quiet through
    // every real-time breach, and at 30s it pages on ordinary freshness.
    expect(alerts).toContain('alert: AnalyticsDataStale');
    expect(alerts).toContain('alert: AnalyticsRealtimeLagBreach');
    const stale = alerts.slice(alerts.indexOf('alert: AnalyticsDataStale'));
    expect(stale.slice(0, stale.indexOf('labels:'))).toMatch(/>\s*900\b/);
    const realtime = alerts.slice(alerts.indexOf('alert: AnalyticsRealtimeLagBreach'));
    expect(realtime.slice(0, realtime.indexOf('labels:'))).toMatch(/>\s*30\b/);
  });

  it('both alerts read the histogram the worker actually emits', () => {
    // An alert naming a series nothing produces never fires, and a configured-but-silent alert is
    // worse than none — the dashboard shows it green. This is the join between the two files.
    for (const rule of ['AnalyticsDataStale', 'AnalyticsRealtimeLagBreach']) {
      const block = alerts.slice(alerts.indexOf(`alert: ${rule}`));
      expect(block.slice(0, block.indexOf('labels:'))).toContain(
        'analytics_ingestion_lag_seconds_bucket',
      );
    }
  });

  it('the histogram has a bucket boundary at each budget', () => {
    // histogram_quantile interpolates between boundaries. Without an exact bucket at 30 and 900,
    // both thresholds above would be compared against a number Prometheus invented.
    const lag = read('services/analytics-worker/internal/metrics/lag.go');
    const buckets = /Buckets:\s*\[\]float64\{([^}]*)\}/.exec(lag)?.[1] ?? '';
    const values = buckets.split(',').map((v) => Number(v.trim()));
    expect(values).toContain(30);
    expect(values).toContain(900);
  });
});
