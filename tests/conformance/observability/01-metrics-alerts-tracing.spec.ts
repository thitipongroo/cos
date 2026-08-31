/**
 * Phase 15 — the observability stack (master:4344-4445).
 *
 * The theme of this phase's spec is failures that are SILENT: a sampler in an SDK that voids the
 * "100% of errors" guarantee, an alert whose metric nobody produces, a substitution syntax that
 * stops a collector from starting. Each of those is asserted here, because none of them shows up as
 * a failing request.
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, readYaml, repoRoot } from '../helpers';

const mon = 'infrastructure/monitoring';
const alerts = read(`${mon}/prometheus/rules/cos-alerts.yml`);
const collector = read(`${mon}/otel-collector/otel-collector-config.yml`);

/** Source files of every service, comments stripped — a comment that names a metric is not one. */
const codeOnly = (body: string): string =>
  body
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1 ')
    .replace(/(^|\s)#[^\n]*/gm, '$1 ');

const serviceSources = ((): string => {
  const out: string[] = [];
  const roots = ['backend/src', 'packages', 'libs', 'services', 'apps'];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (
          !['node_modules', 'dist', 'build', '__pycache__', '.venv', '.next', 'coverage'].includes(
            e.name,
          )
        ) {
          walk(full);
        }
      } else if (/\.(ts|py|go)$/.test(e.name) && !/\.(spec|test)\./.test(e.name)) {
        out.push(fs.readFileSync(full, 'utf8'));
      }
    }
  };
  for (const r of roots) walk(path.join(repoRoot, r));
  return codeOnly(out.join('\n'));
})();

/** master:4356-4378 — every metric the spec makes mandatory. */
const METRICS = [
  'http_request_duration_seconds',
  'http_requests_total',
  'kafka_messages_produced_total',
  'kafka_messages_consumed_total',
  'kafka_consumer_lag',
  'kafka_dlq_depth',
  'db_query_duration_seconds',
  'ai_token_usage_total',
  'ai_request_duration_seconds',
  'sync_queue_depth',
  'file_upload_bytes_total',
  'workflow_started_total',
  'workflow_completed_total',
  'approval_pending_duration_seconds',
  'llm_request_duration_seconds',
  'llm_tokens_consumed_total',
  'rag_retrieval_duration_seconds',
  'ocr_pages_processed_total',
  'notification_delivery_duration_seconds',
  'notification_pending_total',
  'active_sessions_total',
  'storage_used_bytes',
  'tenant_isolation_check_result',
];

describe('Phase 15 · every mandatory metric has a producer (master:4355-4378)', () => {
  it.each(METRICS)('%s is emitted from source, not only documented', (metric) => {
    // Asserted against CODE with comments stripped. Phase 13 and 14 both turned up contracts that
    // were fully declared — schema, catalogue, consumers — and never produced by anything.
    expect(serviceSources).toContain(metric);
  });

  it('names the lag gauge kafka_consumer_lag', () => {
    // Corrected during Phase 8: master once called this `consumer_group_lag`, which is not a metric
    // at all — it reads as the consumer_group LABEL conflated with the gauge.
    expect(serviceSources).not.toMatch(/\bconsumer_group_lag\b/);
  });
});

describe('Phase 15 · alerting rules (master:4380-4393)', () => {
  const RULES: Array<[string, RegExp | null, string | null]> = [
    ['KafkaDLQNonEmpty', /> 0/, '5m'],
    ['APIHighErrorRate', /0\.01/, '5m'],
    ['APIHighLatency', /0\.99/, '5m'],
    ['DBHighQueryTime', /0\.95/, '5m'],
    ['AnalyticsSLABreach', /0\.95/, null],
    ['AIHighTokenUsage', /0\.8/, null],
    ['ServiceDown', null, '2m'],
    ['DBConnectionExhausted', /0\.95/, null],
    ['KafkaConsumerLagCritical', /50000|50_000/, null],
    ['SafetyNotificationFailed', /> 0/, null],
    ['TenantIsolationBreach', /== 0/, null],
    ['DiskUsageHigh', /0\.8/, null],
    ['MemoryPressure', /0\.85/, '10m'],
  ];

  const blockFor = (name: string): string => {
    const start = alerts.indexOf(`- alert: ${name}`);
    const next = alerts.indexOf('- alert: ', start + 1);
    return alerts.slice(start, next === -1 ? undefined : next);
  };

  it.each(RULES.map(([n]) => n))('%s is defined', (name) => {
    expect(alerts).toContain(`- alert: ${name}`);
  });

  it.each(RULES.filter(([, t]) => t !== null))('%s carries its threshold', (name, threshold) => {
    expect(blockFor(name as string)).toMatch(threshold as RegExp);
  });

  it.each(RULES.filter(([, , d]) => d !== null))('%s waits %s before firing', (name, _t, dur) => {
    // The `for:` window is what separates an alert from a blip. KafkaDLQNonEmpty firing instantly
    // would page on every transient redelivery.
    expect(blockFor(name as string)).toMatch(new RegExp(`for:\\s*${dur}`));
  });

  it('pages on the five the spec marks critical, and only warns on the two it does not', () => {
    for (const critical of [
      'ServiceDown',
      'DBConnectionExhausted',
      'KafkaConsumerLagCritical',
      'SafetyNotificationFailed',
      'TenantIsolationBreach',
    ]) {
      expect(blockFor(critical)).toMatch(/severity:\s*critical/);
    }
    for (const warning of ['DiskUsageHigh', 'MemoryPressure']) {
      expect(blockFor(warning)).toMatch(/severity:\s*warning/);
    }
  });

  it('every alert rests on a metric something produces', () => {
    // An alert whose metric has no producer never fires — and a silent alert is worse than no
    // alert, because the dashboard shows it configured. TenantIsolationBreach and
    // SafetyNotificationFailed are the two that depend on probes rather than request traffic.
    for (const metric of [
      'tenant_isolation_check_result',
      'notification_pending_total',
      'kafka_dlq_depth',
    ]) {
      expect(alerts).toContain(metric);
      expect(serviceSources).toContain(metric);
    }
  });
});

describe('Phase 15 · sampling happens only at the Collector (master:4400-4407; ADR-075)', () => {
  it('the Collector tail-samples', () => {
    expect(collector).toMatch(/tail_sampling:/);
    expect(collector).toMatch(/processors:.*tail_sampling/);
  });

  it('reads its baseline from OTEL_SAMPLING_PERCENTAGE', () => {
    expect(collector).toMatch(/sampling_percentage:\s*\$\{env:OTEL_SAMPLING_PERCENTAGE\}/);
  });

  it('uses only the ${env:VAR} form collector 0.103.0 accepts', () => {
    // The older `${VAR:-default}` form makes the Collector REFUSE TO START — a failure that takes
    // the whole telemetry pipeline down at deploy time, not gradually. Scanned with comments
    // stripped: the file documents that past failure by quoting the broken form.
    expect(codeOnly(collector)).not.toMatch(/\$\{[A-Z_]+:-/);
  });

  it.each([
    ['Node', 'packages/@cos/tracing/src/otel.ts'],
    ['Python', 'services/ai-gateway/otel.py'],
    ['Go', 'libs/go/cosotel/otel.go'],
  ])('the %s SDK configures no sampler', (_lang, file) => {
    // THE FAILURE THIS PREVENTS IS SILENT. Head-sampling discards spans inside the service, before
    // the Collector's tail_sampling can apply its error / AI-LLM / financial policies — so the
    // "100% for errors" guarantee stops holding and nothing reports that it has.
    const src = codeOnly(read(file));
    expect(src).not.toMatch(/TraceIdRatioBased|ParentBasedTraceIdRatio|sampler\s*[:=]/i);
    expect(src).not.toMatch(/OTEL_SAMPLING_RATIO|samplingRatio/);
  });
});

// Trace propagation moved to backend/test/observability/01-http-metrics-and-tracing
// .integration (2026-08-25): it asserts the same two header names AND that a traceparent survives a
// real request, which the source scan alone could not.

/**
 * The per-environment sampling baselines (master:4451, spec §31.5).
 *
 * The MECHANISM was already pinned above — the `${env:VAR}` form the Collector accepts, and the
 * absence of any SDK sampler. The VALUES were not, and they are the half that costs money: the
 * overlays carry development=100, staging=10, production=1, and nothing read them.
 *
 * Each number fails differently, which is why all three are asserted rather than just production:
 *   production 1 -> 100   every span kept; a trace-volume and bill blow-up with no error to show
 *   staging   10 -> 1     a staging soak stops seeing the traces it exists to produce
 *   development 100 -> 1  a developer debugging locally loses 99 of every 100 traces and concludes
 *                         the instrumentation is broken
 *
 * Read from the kustomize overlays because that is what `kubectl apply -k` actually ships; the
 * base Deployment only declares the variable.
 */
describe('Phase 15 · the sampling baseline per environment (master:4451)', () => {
  const OVERLAYS: ReadonlyArray<[string, string]> = [
    ['development', '100'],
    ['staging', '10'],
    ['production', '1'],
  ];

  const overlay = (env: string): string =>
    read(`${mon}/otel-collector-overlays/${env}/kustomization.yaml`);

  it.each(OVERLAYS)('the %s overlay samples at %s percent', (env, percent) => {
    const src = overlay(env);
    const at = src.indexOf('name: OTEL_SAMPLING_PERCENTAGE');
    expect(at).toBeGreaterThan(-1);
    // The value on the line that follows the name — a file-wide search would match the number
    // anywhere, including a replica count.
    expect(src.slice(at, at + 200)).toMatch(new RegExp(`value:\\s*'?${percent}'?\\s`));
  });

  it('the three environments do not all carry the same number', () => {
    // CONTROL. If the reader above matched something other than this variable, all three cases
    // could pass against one value and the suite would report a graded rollout that does not exist.
    const values = OVERLAYS.map(([env]) => {
      const src = overlay(env);
      const at = src.indexOf('name: OTEL_SAMPLING_PERCENTAGE');
      return /value:\s*'?(\d+)'?/.exec(src.slice(at, at + 200))?.[1];
    });
    expect(new Set(values).size).toBe(3);
  });

  it('is a PERCENT, never the old ratio', () => {
    // master:4450 and ADR-075: renamed from OTEL_SAMPLING_RATIO because copying the old 0.01 into
    // the new variable under-samples by 100x — and nothing about the pipeline looks broken when it
    // does. A decimal point in any overlay is that mistake.
    for (const [env] of OVERLAYS) {
      const src = overlay(env);
      const at = src.indexOf('name: OTEL_SAMPLING_PERCENTAGE');
      expect(src.slice(at, at + 200)).not.toMatch(/value:\s*'?0?\.\d/);
    }
  });
});

describe('Phase 15 · dashboards (master:4409-4421)', () => {
  const dashboards = fs
    .readdirSync(path.join(repoRoot, `${mon}/grafana/dashboards`))
    .filter((f) => f.endsWith('.json'));

  it.each([
    ['per-service', 'per-service.json'],
    ['Kafka', 'kafka.json'],
    ['Database', 'database.json'],
    ['AI', 'ai.json'],
    ['Infrastructure', 'infrastructure.json'],
    ['Platform Overview', 'platform-overview.json'],
    ['Tenant Operations', 'tenant-operations.json'],
    ['Business Metrics', 'business-metrics.json'],
    ['SLO Burn Rate', 'slo-burn-rate.json'],
  ])('the %s dashboard exists', (_name, file) => {
    expect(dashboards).toContain(file);
  });

  it.each(['per-service.json', 'kafka.json', 'slo-burn-rate.json'])('%s is valid JSON', (file) => {
    // A dashboard that fails to parse is one Grafana silently refuses to import.
    expect(() => JSON.parse(read(`${mon}/grafana/dashboards/${file}`))).not.toThrow();
  });

  it('the registry records dashboard IDs and SLO targets', () => {
    expect(exists('docs/registers/dashboard-registry.md')).toBe(true);
    const registry = read('docs/registers/dashboard-registry.md');
    expect(registry).toMatch(/slo/i);
  });
});

describe('Phase 15 · collection and retention (master:4426-4439)', () => {
  it('Prometheus scrapes the services', () => {
    const prom = readYaml<{ scrape_configs: Array<{ job_name: string }> }>(
      `${mon}/prometheus/prometheus.yml`,
    );
    expect(prom.scrape_configs.length).toBeGreaterThan(1);
  });

  it('Loki takes structured JSON logs', () => {
    expect(exists(`${mon}/loki/loki-config.yml`)).toBe(true);
    expect(read(`${mon}/loki/promtail-config.yml`)).toMatch(/json/i);
  });

  // The interceptor wiring, the unmatched-route middleware and the (unmatched) label were asserted
  // here by reading app.module.ts. The integration suite now BOOTS the app and reads the metrics
  // that were actually recorded — including a request to no route at all, and the proof that every
  // unmatched path collapses into one label rather than exploding cardinality. Dropped 2026-08-25.

  it('the log retention policy states the application-log tiers', () => {
    // Application logs: 30-day hot, 1-year cold (master:4436, spec §31.4).
    const policy = read('docs/policies/log-retention-policy.md');
    expect(policy).toMatch(/30[- ]day/i);
    expect(policy).toMatch(/1 year/i);
  });

  it('audit logs are kept seven years and are WORM while kept', () => {
    // Settled 2026-08-23. §31.4's prose said "never deleted" while the schedule IT NAMES as
    // authoritative expires them on day 2557 — as does data-retention-policy.md, both citing SOC 2
    // and the PDPA audit trail. The operational schedule won; §31.4 was corrected.
    const policy = read('docs/policies/log-retention-policy.md');
    expect(policy).toMatch(/7[- ]year/i);
    // The immutability guarantee was missing from the authoritative file entirely: a lifecycle rule
    // written from it without Object Lock would meet the retention period and lose the control.
    expect(policy).toMatch(/WORM/);
    expect(policy).toMatch(/Object Lock/i);
  });

  it('the retention TABLE in the spec matches the schedule', () => {
    // Asserted on the table, not on the prose: the correction note quotes the old sentence, and a
    // quotation of a claim is not the claim — the same trap that made three Phase 14 tests fail.
    const spec = read('docs/specifications/31-monitoring-observability.md');
    const row = /\| Audit logs\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/.exec(spec);
    expect(row).not.toBeNull();
    expect(row![1]).not.toMatch(/Indefinite/i);
    expect(row![3]).toMatch(/7 years \(WORM\)/);
    expect(row![3]).toMatch(/then delete/i);
    // Immutability is still required — the two are different guarantees and only one was wrong.
    expect(spec).toMatch(/immutable append-only store/);
  });

  it('the two retention documents agree with each other', () => {
    // They are read by different audiences — one by whoever configures Loki and S3, the other by
    // the PDPA control register — and a disagreement between them is invisible from either side.
    for (const doc of [
      'docs/policies/log-retention-policy.md',
      'docs/policies/data-retention-policy.md',
    ]) {
      expect(read(doc)).toMatch(/7[- ]year/i);
    }
  });

  it('synthetic probes run from at least two regions at a 60-second interval', () => {
    const probes = read('infrastructure/synthetics/health-probes.yaml');
    const regions = [
      ...probes.matchAll(/^\s*-\s*(?:name:|id:)?\s*['"]?(ap-|us-|eu-)[a-z0-9-]+/gim),
    ];
    expect(probes).toMatch(/interval:\s*60/);
    // Two named AWS regions — a single-region probe cannot distinguish "the service is down" from
    // "this region cannot reach it".
    expect(probes).toMatch(/ap-southeast-7|ap-southeast-1/);
    expect(regions.length + (probes.match(/ap-southeast-\d/g) ?? []).length).toBeGreaterThanOrEqual(
      2,
    );
  });
});
