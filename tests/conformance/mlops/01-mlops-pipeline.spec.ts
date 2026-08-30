/**
 * Phase 23 — MLOps Pipeline (master:5424-5626).
 *
 * Almost everything this phase generates is a STUB by instruction — the models are gated on data
 * thresholds nobody has reached. That makes the checkable content unusual: not behaviour, but the
 * decisions the stubs encode. Which tool, at which major version, with which store behind it, and —
 * for two of them — what the code is forbidden from doing once it stops being a stub.
 *
 * The prohibitions are the reason this file leans negative. §22.3 bars AI from executing a state
 * transition that needs a human, and master:5566 and 5618 repeat it for the autonomous executor and
 * the device-trust score. A stub that quietly grows a revoke() call is the failure mode, and it will
 * not announce itself.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { exists, read, readYaml, abs } from '../helpers';

const DAGS = 'mlops/airflow/dags';

const mlopsFiles = ((): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['__pycache__', '.venv', '.pytest_cache'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(py|ya?ml|txt)$/.test(entry.name)) out.push(full);
    }
  };
  walk(abs('mlops'));
  return out;
})();

// ── 1. Airflow DAGs ─────────────────────────────────────────────────────────

describe('Phase 23 · Airflow DAGs (master:5477-5482, 5486)', () => {
  // master names five. dag_train_device_trust_model.py is a sixth, added with ADR-081's model.
  const named = [
    'dag_export_training_data',
    'dag_train_delay_model',
    'dag_train_risk_classifier',
    'dag_update_feature_store',
    'dag_model_evaluation',
  ];

  it.each(named)('has %s', (dag) => {
    expect(exists(`${DAGS}/${dag}.py`)).toBe(true);
  });

  it('marks each one as a stub with work still to do', () => {
    // master:5486 asks for stubs "with clear TODO markers". A stub that reads as finished is worse
    // than no stub: the next person wires a pipeline to a function that returns nothing.
    const missing = named.filter((dag) => !/TODO/.test(read(`${DAGS}/${dag}.py`)));
    expect(missing).toEqual([]);
  });

  it('writes the data lake per tenant, not into one shared bucket', () => {
    // master:5490 — cos-datalake-{tenant_id}. A single bucket would put one tenant's site reports in
    // reach of another's training job, which is the one isolation boundary this platform cannot bend.
    expect(read(`${DAGS}/dag_export_training_data.py`)).toContain('cos-datalake-{tenant_id}');
  });
});

// ── 2, 11. MLflow and Airflow versions ──────────────────────────────────────

describe('Phase 23 · stack versions (master:5432-5433)', () => {
  it('deploys MLflow as both a compose service and a Kubernetes workload', () => {
    expect(exists('mlops/mlflow/docker-compose.yaml')).toBe(true);
    expect(exists('infrastructure/kubernetes/mlflow/deployment.yaml')).toBe(true);
  });

  it('runs MLflow 3.x on BOTH the client and the server', () => {
    // master:5432 bumped 2.x→3.x by product-owner decision. The client pin and the server image are
    // asserted together because they drifted apart: the pin said 3.14.0 while both deployments still
    // ran the v2.14.1 image — a 3.x client talking to a 2.x model registry.
    expect(read('mlops/requirements-mlflow.txt')).toMatch(/^mlflow==3\./m);
    for (const f of [
      'mlops/mlflow/docker-compose.yaml',
      'infrastructure/kubernetes/mlflow/deployment.yaml',
    ]) {
      expect(read(f)).toMatch(/image: ghcr\.io\/mlflow\/mlflow:v3\./);
    }
  });

  it('runs Airflow 3.x', () => {
    expect(read('mlops/requirements-airflow.txt')).toMatch(/^apache-airflow==3\./m);
  });
});

// ── 3-5. Feast ──────────────────────────────────────────────────────────────

describe('Phase 23 · feature store (master:5463-5475)', () => {
  const store = (): Record<string, { type?: string; db_schema?: string }> =>
    readYaml('mlops/feast/feature_store.yaml');

  it('serves online features from Redis', () => {
    expect(store()['online_store']?.type).toBe('redis');
  });

  it('keeps the offline store on PostgreSQL, NOT ClickHouse', () => {
    // The decision is spelled out at master:5469-5475 with its reasoning: both are Feast contrib
    // stores, and ClickHouse's own guidance is that a Feast "literal store" underutilises it. The
    // negative half matters — "offline store" and "analytics warehouse" are easy to conflate.
    expect(store()['offline_store']?.type).toBe('postgres');
    expect(store()['offline_store']?.db_schema).toBe('feast_offline');
    expect(read('mlops/feast/feature_store.yaml')).not.toMatch(/type:\s*clickhouse/);
  });

  it('declares the three feature views with the features the spec names', () => {
    const declared = ['project_features', 'procurement_features', 'site_features'].flatMap((view) =>
      [...read(`mlops/feast/features/${view}.py`).matchAll(/name="([a-z_0-9]+)"/g)].map(
        (m) => m[1],
      ),
    );
    for (const feature of [
      'budget_variance',
      'days_to_deadline',
      'open_issue_count',
      'avg_delivery_delay',
      'rfq_to_po_days',
      'overdue_invoice_count',
      'manpower_7d_avg',
      'inspection_fail_rate',
      'report_submission_rate',
    ]) {
      expect(declared).toContain(feature);
    }
  });
});

// ── 6-10. The remaining Generate items ──────────────────────────────────────

describe('Phase 23 · pipeline plumbing (master:5489-5493)', () => {
  it('has a Kubeflow pipeline definition', () => {
    const files = fs.readdirSync(abs('mlops/kubeflow'));
    expect(files.filter((f) => /\.ya?ml$/.test(f)).length).toBeGreaterThan(0);
  });

  it('exports to Parquet through pyarrow, not a hand-rolled writer', () => {
    const util = read('mlops/data_export/export_to_parquet.py');
    expect(util).toMatch(/import pyarrow/);
    expect(util).toMatch(/pyarrow\.parquet/);
  });

  it('updates the AI Gateway endpoint after deployment', () => {
    expect(exists('mlops/serving/update_gateway.py')).toBe(true);
  });

  it('records the provider decisions in §22.6', () => {
    expect(read('docs/specifications/22-ai-architecture.md')).toMatch(/22\.6/);
  });
});

// ── 12. Evidently, not W&B ──────────────────────────────────────────────────

describe('Phase 23 · evaluation provider (master:5436-5437; ADR-038)', () => {
  it('NEGATIVE — no Weights & Biases anywhere in the MLOps tree', () => {
    // ADR-038 replaced W&B with Evidently precisely because the stack must stay in-cluster with no
    // external SaaS and no API key. A stray `import wandb` would send experiment metadata off-site.
    const offenders = mlopsFiles.filter((f) => /\bwandb\b/i.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('names Evidently as the evaluation and drift provider', () => {
    const monitoring = read('mlops/interfaces/experiment_monitoring.py');
    expect(monitoring).toMatch(/Evidently/);
    expect(monitoring).toMatch(/MLflow/);
  });
});

// ── 13. Model stubs ─────────────────────────────────────────────────────────

describe('Phase 23 · model stubs (master:5550-5619)', () => {
  const models: Array<[string, RegExp]> = [
    ['delay_forecast_model', /90\+? days/i],
    ['safety_vision_model', /10,?000\+? labeled/i],
    ['graph_ml_model', /6\+? months/i],
    ['risk_classifier', /50\+? projects/i],
    ['device_trust_model', /PR-AUC/],
  ];

  it.each(models)('%s records the trigger that promotes it', (model, trigger) => {
    const src = read(`mlops/models/${model}.py`);
    expect(src).toMatch(trigger);
  });

  it.each(models.map(([m]) => m))('%s names XGBoost, the RESOLVED algorithm', (model) => {
    // §22.6 resolved every one of them to XGBoost. Recording it in the stub is what stops the next
    // author picking a framework because the spec was two documents away.
    expect(read(`mlops/models/${model}.py`)).toMatch(/XGBoost/i);
  });
});

// ── 14. DeviceTrustModel governance ─────────────────────────────────────────

describe('Phase 23 · device trust is advisory only (master:5607-5619; ADR-081)', () => {
  it('serves a rule-based baseline on day one', () => {
    // master:5612 — the baseline IS the thing the model must beat, and it serves behind the same
    // interface until it does. Without it the surface would be dark, or worse, described as AI.
    expect(exists('mlops/models/device_trust_baseline.py')).toBe(true);
  });

  it('states that it never revokes a device and never blocks a login', () => {
    // §22.3 bars AI from executing a state transition that requires a human. A trust SCORE that can
    // lock someone out of a site handset is that transition.
    const src = read('mlops/models/device_trust_model.py');
    expect(src).toMatch(/ADVISORY/);
    expect(src).toMatch(/never revokes a device/i);
    expect(src).toMatch(/never blocks a login/i);
  });

  it('NEGATIVE — no revoke or block call in the trust path', () => {
    for (const f of [
      'mlops/models/device_trust_model.py',
      'mlops/models/device_trust_baseline.py',
    ]) {
      const code = read(f)
        .split('\n')
        .filter((l) => !l.trimStart().startsWith('#'))
        .join('\n');
      expect(code).not.toMatch(/\b(revoke|block)_?\w*\s*\(/);
    }
  });

  it('spells the scorer field the same way in all three implementations', () => {
    // master:5615 fixes the shape as `scoredBy: 'RULES'|'MODEL'`. Three independent implementations
    // put that value on the wire — the backend scorer, the Python training-time baseline that must
    // reproduce it byte for byte (device-trust-golden.json is their shared contract), and the mobile
    // client that reads it. Each layer pins the string 'RULES' in its OWN tests; nothing compares
    // the layers, so renaming the field or the value in one of them alone stays green everywhere
    // and only shows up as a badge that has silently stopped saying "rule-based" on a real handset.
    //
    // 'RULE_BASED' is a different thing and deliberately not asserted here: it is the mobile BADGE
    // (scorerBadge returns 'AI_VERIFIED' | 'RULE_BASED'), one layer above the wire value.
    const backend = read('backend/src/modules/identity/device-trust/trust-score/trust-score.ts');
    const mobile = read('apps/mobile/src/api/devices.ts');
    const baseline = read('mlops/models/device_trust_baseline.py');

    // The union, both members, in both TypeScript declarations.
    for (const src of [backend, mobile]) {
      expect(src).toMatch(/'RULES'\s*\|\s*'MODEL'/);
    }
    expect(backend).toMatch(/\bscoredBy\b/);
    expect(mobile).toMatch(/\bscoredBy\b/);
    expect(baseline).toMatch(/"scoredBy":\s*"RULES"/);

    // CONTROL: the spec's own wording is NOT what any of them ship. Asserted so that a future edit
    // that "fixes" one layer to match the phase-command prose fails here instead of silently
    // splitting the three apart.
    for (const src of [backend, mobile, baseline]) {
      expect(src).not.toMatch(/'RULE_BASED'|"RULE_BASED"/);
    }
  });
});

// ── 15. Autonomous executor stays inert ─────────────────────────────────────

describe('Phase 23 · autonomous executor is a stub (master:5562-5567)', () => {
  it('exists as an interface stub', () => {
    expect(exists('mlops/interfaces/autonomous_workflow_executor.py')).toBe(true);
  });

  it('records the three things it must never trigger', () => {
    // master:5566-5567 — never financial transactions, human-approval workflows, or data deletions.
    // "Phase 23+ — do NOT activate in Phase 23 itself" is a status, and statuses get forgotten; the
    // prohibition is what has to survive.
    const src = read('mlops/interfaces/autonomous_workflow_executor.py');
    expect(src).toMatch(/financial/i);
    expect(src).toMatch(/approval/i);
    expect(src).toMatch(/deletion|delete/i);
  });
});

// ── 16. Unit tests ──────────────────────────────────────────────────────────

describe('Phase 23 · unit tests (master:5494)', () => {
  it('covers DAG task functions with mocked data sources', () => {
    expect(exists('mlops/tests/test_dag_tasks.py')).toBe(true);
    expect(read('mlops/tests/test_dag_tasks.py')).toMatch(/mock|patch/i);
  });
});

// ── The two producers this phase was told to finish ─────────────────────────

describe('Phase 23 · the deferred producers (master:5496, 5519)', () => {
  it('publishes construction.delay.detected.v1', () => {
    // Deferred here on 2026-08-23 because DelayForecastModel is the AI_FORECAST source the payload
    // names; built 2026-08-25 by product-owner decision. It emits nothing while the model is a stub —
    // the point is that the wiring is finished, so the event flows the day the model lands.
    const producer = read('services/ai-gateway/reports/delay_event.py');
    expect(producer).toContain('construction.delay.detected.v1');
    expect(producer).toMatch(/send_and_wait/);
  });

  it('bands delay severity on the thresholds §32.4 row 8 states', () => {
    const producer = read('services/ai-gateway/reports/delay_event.py');
    // LOW=1-2, MEDIUM=3-6, HIGH=7-13, CRITICAL=14+. Copied from the spec, not re-derived — the same
    // bands Phase 12's delay-risk report uses.
    expect(producer).toMatch(/>= 14[\s\S]{0,60}CRITICAL/);
    expect(producer).toMatch(/>= 7[\s\S]{0,60}HIGH/);
    expect(producer).toMatch(/>= 3[\s\S]{0,60}MEDIUM/);
  });

  it('publishes safety.violation.detected.v1, wired end to end', () => {
    // The five halves master:5529 requires. Any one missing puts the event back in the state §19.6
    // was found in: a rule about a notification that is never created.
    expect(exists('packages/@cos/kafka/src/avro/safety.violation.detected.v1.avsc')).toBe(true);
    expect(exists('packages/@cos/shared/src/events/safety.violation.detected.v1.ts')).toBe(true);
    expect(read('packages/@cos/kafka/src/topic-catalog.ts')).toContain(
      "'safety.violation.detected.v1'",
    );
    expect(exists('services/ai-gateway/reports/safety_violation_event.py')).toBe(true);
    const notif = read('backend/src/modules/notification/notification.service.ts');
    expect(notif).toContain("'safety.violation.detected.v1'");
    expect(read('backend/src/modules/notification/notification.consumer.ts')).toContain(
      "'safety.violation.detected.v1'",
    );
    expect(
      exists(
        'backend/prisma/migrations/20260825000003_safety_violation_notification_template/migration.sql',
      ),
    ).toBe(true);
  });

  it('never emits a violation event for a clean photo', () => {
    // This is an event §19.6 says a user cannot mute. An empty-violations emit would page the Safety
    // Officer about a photo the model cleared, and they could not turn it off.
    expect(read('services/ai-gateway/reports/safety_violation_event.py')).toMatch(
      /if not analysis\.get\("violations"\)/,
    );
  });
});
