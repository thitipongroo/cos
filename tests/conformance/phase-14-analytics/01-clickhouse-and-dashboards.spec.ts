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
