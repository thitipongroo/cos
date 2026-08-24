/**
 * Phase 18 — the testing estate's own contract (master:4744-4862).
 *
 * This phase governs the tests, so the assertions here are about the harness rather than the
 * product: the coverage gate, the load-test pass criteria, the E2E inventory, and the two patterns
 * the spec singles out because they make a suite HANG rather than fail — synchronous fake timers,
 * and Temporal workflow specs run in parallel.
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, repoRoot } from '../helpers';

/** Source with comments stripped — a comment naming a construct is not that construct. */
const codeOnly = (body: string): string =>
  body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/gm, '$1 ');

const collectTs = (dir: string, filter: (name: string) => boolean): Array<[string, string]> => {
  const out: Array<[string, string]> = [];
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!['node_modules', 'dist', 'coverage', '.next', 'build'].includes(e.name)) walk(full);
      } else if (filter(e.name))
        out.push([path.relative(repoRoot, full), fs.readFileSync(full, 'utf8')]);
    }
  };
  walk(path.join(repoRoot, dir));
  return out;
};

describe('Phase 18 · the coverage gate (master:4766-4767, 4812)', () => {
  const jestConfig = read('backend/jest.config.js');

  it('requires 100% lines and 100% branches', () => {
    // QM-1. Branch coverage is the half that matters: a line can be executed by a test that never
    // takes its `else`, which is exactly where the Phase 3 date-comparison and the Phase 5 approval
    // boundary defects were hiding.
    expect(jestConfig).toMatch(/lines:\s*100/);
    expect(jestConfig).toMatch(/branches:\s*100/);
  });

  it('does not lower the bar with a global exclusion', () => {
    // A `collectCoverageFrom` that removes whole directories reaches 100% of a smaller thing. The
    // exclusions that ARE present must be narrow and explained.
    const excludes = [...jestConfig.matchAll(/'!([^']+)'/g)].map((m) => m[1]!);
    for (const pattern of excludes) {
      expect(pattern).not.toMatch(/^src\/\*\*$|^src\/modules\/\*\*$/);
    }
  });
});

describe('Phase 18 · fake timers (master:4840-4848; Rule 30)', () => {
  const specs = collectTs('backend/src', (n) => /\.spec\.ts$/.test(n))
    .concat(collectTs('packages', (n) => /\.spec\.ts$/.test(n)))
    .concat(collectTs('apps/mobile/src', (n) => /\.spec\.tsx?$/.test(n)));

  it('found the spec files to scan', () => {
    expect(specs.length).toBeGreaterThan(100);
  });

  it('no spec calls the synchronous jest.runAllTimers()', () => {
    // The spec spells out the consequence: with a multi-step retry the microtask queue is not
    // drained between calls, so the test HANGS rather than failing. A hang has no message and no
    // stack — it is the most expensive failure mode in a suite.
    const offenders = specs
      .filter(([, body]) => /jest\.runAllTimers\s*\(\s*\)/.test(codeOnly(body)))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('the async form is actually used somewhere', () => {
    // Control for the assertion above: "nobody calls the sync form" would also pass in a codebase
    // that never uses fake timers at all, which would tell us nothing.
    const users = specs.filter(([, body]) => /runAllTimersAsync/.test(body));
    expect(users.length).toBeGreaterThan(0);
  });
});

describe('Phase 18 · Temporal workflow specs run serially (master:4850-4855)', () => {
  const workflows = read('backend/jest.workflows.config.js');
  const unit = read('backend/jest.config.js');

  it('the workflow config pins a single worker', () => {
    // Parallel TestWorkflowEnvironment time-skipping servers starve each other; the symptom the
    // spec records is a flaky "Exceeded timeout for a hook" — again a hang, not a failure.
    expect(workflows).toMatch(/maxWorkers:\s*1/);
  });

  it('it selects only *.workflow.spec.ts', () => {
    expect(workflows).toMatch(/\*\.workflow\.spec\.ts/);
  });

  it('the parallel unit run excludes them', () => {
    // If both configs picked them up, the serial gate would be pointless — the parallel run would
    // still start several Temporal servers at once.
    expect(unit).toMatch(/workflow\.spec\.ts/);
  });

  it('CI runs the serial gate as its own step', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/test:workflows/);
  });
});

describe('Phase 18 · k6 load scenarios (master:4776-4791)', () => {
  const SCENARIOS: Array<[string, string, number, number]> = [
    // file, description, p95 milliseconds, error-rate fraction
    ['dashboard-sla.js', 'Dashboard SLA', 3000, 0.001],
    ['file-upload.js', 'Concurrent file uploads', 10000, 0.005],
    ['api-baseline.js', 'API gateway throughput', 1000, 0.001],
    ['ai-report.js', 'AI report generation', 15000, 0.01],
  ];

  it.each(SCENARIOS.map(([f]) => f))('%s exists', (file) => {
    expect(exists(`tests/load/${file}`)).toBe(true);
  });

  it.each(SCENARIOS)('%s holds P95 < %sms', (file, _name, p95) => {
    // The pass criteria ARE the scenario. A script that runs the right load with a looser threshold
    // reports success on an SLA breach.
    expect(read(`tests/load/${file}`)).toMatch(new RegExp(`p\\(95\\)<${p95}\\b`));
  });

  it.each(SCENARIOS)('%s caps the error rate at %s', (file, _name, _p95, rate) => {
    expect(read(`tests/load/${file}`)).toMatch(
      new RegExp(`http_req_failed:\\s*\\['rate<${String(rate)}'\\]`),
    );
  });

  it.each([
    ['dashboard-sla.js', 100],
    ['file-upload.js', 20],
    ['api-baseline.js', 200],
    ['ai-report.js', 10],
  ])('%s peaks at %s VUs', (file, vus) => {
    expect(read(`tests/load/${file}`)).toMatch(new RegExp(`target:\\s*${vus}\\b`));
  });

  it('load tests are scheduled weekly, not run per deploy (master:4663, 4834)', () => {
    // Running a 200-VU test on every deploy would make the pipeline the load, and would gate merges
    // on a signal that is inherently noisy.
    const workflow = read('.github/workflows/load-tests.yml');
    expect(workflow).toMatch(/schedule:/);
    expect(workflow).toMatch(/cron:\s*'0 \d+ \* \* \d'/);
    expect(workflow).not.toMatch(/on:\s*\n\s*push:/);
  });
});

describe('Phase 18 · E2E inventory (master:4818-4832)', () => {
  const playwright = fs.readdirSync(path.join(repoRoot, 'tests/e2e/specs'));

  it.each([
    ['login', /auth/],
    ['project create', /project/],
    ['report submit', /report/],
    ['dashboard view', /dashboard/],
    ['procurement flow', /procurement/],
    ['daily site report', /daily-report/],
    ['budget exceeded alert', /budget-exceeded/],
    ['safety incident', /safety-incident/],
    ['QC inspection', /qc-inspection/],
    ['approval escalation', /approval-escalation/],
  ])('the %s journey has a spec', (_name, pattern) => {
    expect(playwright.some((f) => pattern.test(f))).toBe(true);
  });

  it('Detox covers offline inspection and sync conflict', () => {
    const detox = fs.readdirSync(path.join(repoRoot, 'apps/mobile/e2e'));
    expect(detox).toContain('offline-inspection.spec.ts');
    expect(detox).toContain('sync-conflict.spec.ts');
  });

  it('the retired offline check-in scenario is gone (master:4832)', () => {
    // Retired 2026-08-21: self check-in was removed from the mobile product on 2026-08-09, so the
    // scenario had no control to drive. A spec left behind would fail for a reason that looks like a
    // regression rather than a deliberate removal.
    const detox = collectTs('apps/mobile/e2e', (n) => /\.spec\.ts$/.test(n));
    const offenders = detox
      .filter(([, body]) => /offline check-?in/i.test(body))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});

describe('Phase 18 · Pact contract pairs (master:4793-4797, 4833)', () => {
  it.each([
    ['Finance ← Procurement', 'finance-procurement.pact.spec.ts'],
    ['Analytics ← all services', 'analytics-all-services.pact.spec.ts'],
    ['Mobile ← all services', 'mobile-backend.pact.spec.ts'],
  ])('%s has a consumer test', (_pair, file) => {
    expect(exists(`tests/contract/${file}`)).toBe(true);
  });
});

describe('Phase 18 · @cos/test-utils (master:4815-4816, 4835-4836)', () => {
  it('has the README QM-11 requires', () => {
    expect(exists('packages/@cos/test-utils/README.md')).toBe(true);
    const readme = read('packages/@cos/test-utils/README.md');
    for (const section of [/purpose/i, /usage/i]) expect(readme).toMatch(section);
  });

  it('names every request-DTO factory build<EntityName>Dto', () => {
    // The naming is the contract: a factory called anything else is not discoverable by the
    // convention the spec fixed, and a duplicate gets written instead.
    //
    // master:4835 scopes the rule — "naming: build<EntityName>Dto FOR REQUEST DTOS". The file also
    // exports entity builders (buildTenant, buildUser, buildProject …) which construct rows rather
    // than request bodies; requiring a Dto suffix on those would be inventing a rule the spec does
    // not state.
    const factories = read('packages/@cos/test-utils/src/factories.ts');
    const exported = [...factories.matchAll(/export function (\w+)/g)].map((m) => m[1]!);
    expect(exported.length).toBeGreaterThan(5);

    const dtoFactories = exported.filter((n) => /Dto/.test(n));
    expect(dtoFactories.length).toBeGreaterThan(5);
    for (const name of dtoFactories) expect(name).toMatch(/^build[A-Z]\w*Dto$/);

    // Everything else must still start with `build` — the factory_bot pattern the spec names.
    for (const name of exported) expect(name).toMatch(/^build[A-Z]/);
  });

  it('provides a database reset utility', () => {
    expect(exists('packages/@cos/test-utils/src/db-reset.ts')).toBe(true);
    const reset = read('packages/@cos/test-utils/src/db-reset.ts');
    expect(reset).toMatch(/TRUNCATE/i);
  });
});

describe('Phase 18 · testcontainers image (master:4801-4803; ADR-032)', () => {
  it('the integration harness uses the TimescaleDB image', () => {
    // Three migrations call create_hypertable, which plain postgres does not have. The failure is
    // at migrate time, so a suite on the wrong image cannot even reach its first assertion.
    const infra = read('backend/test/helpers/integration-infra.ts');
    expect(infra).toMatch(/timescale\/timescaledb/);
  });

  it('the SHARED helper uses the same image, not a plainer one', () => {
    // Corrected 2026-08-24. @cos/test-utils hardcoded `postgres:16-alpine`, which has no
    // create_hypertable. Nothing was broken because startContainers had no caller outside its own
    // unit test — but the first suite to run backend migrations through it would have died at
    // migrate time, with an error about an unknown function rather than about the image.
    const helper = read('packages/@cos/test-utils/src/containers.ts');
    expect(helper).toMatch(/POSTGRES_IMAGE = 'timescale\/timescaledb/);
    expect(helper).not.toMatch(/PostgreSqlContainer\('postgres:/);
  });

  it('the two harnesses name the SAME image', () => {
    // Two places starting PostgreSQL for tests is already one too many; two places starting
    // DIFFERENT PostgreSQLs is a difference that only shows up as a migration failure in whichever
    // suite happens to use the wrong one.
    const infra = read('backend/test/helpers/integration-infra.ts');
    const helper = read('packages/@cos/test-utils/src/containers.ts');
    const image = /timescale\/timescaledb:[\w.-]+/;
    expect(image.exec(infra)?.[0]).toBe(image.exec(helper)?.[0]);
  });

  it('a BUILT copy, if one is present, carries it too', () => {
    // The package's `main` is dist/, so a consumer resolving through package.json gets the built
    // copy — a fixed source beside a stale dist is a fix that does not ship.
    //
    // Conditional on purpose: dist/ is gitignored, so on a fresh clone it does not exist yet and an
    // unconditional assertion would fail for a reason unrelated to the image. CI builds before it
    // tests (`turbo run build`), and a developer who has built once gets the staleness check.
    const built = 'packages/@cos/test-utils/dist/containers.js';
    if (!exists(built)) return;
    expect(read(built)).toMatch(/POSTGRES_IMAGE = 'timescale\/timescaledb/);
  });

  it('migrations really do need it', () => {
    // Control: if no migration used hypertables the image requirement would be cargo cult.
    const migrations = collectTs('backend/prisma/migrations', (n) => n.endsWith('.sql'));
    expect(migrations.filter(([, body]) => /create_hypertable/.test(body)).length).toBeGreaterThan(
      0,
    );
  });
});

describe('Phase 18 · python and API-lifecycle artefacts (master:4814, 4837-4838)', () => {
  it.each(['ai-gateway', 'ai-embedding-worker', 'ai-ocr-pipeline', 'ai-transcription-pipeline'])(
    'services/%s has a pytest config',
    (service) => {
      expect(exists(`services/${service}/pytest.ini`)).toBe(true);
    },
  );

  it('the deprecation schedule promises at least 90 days', () => {
    const schedule = read('docs/api/deprecation-schedule.md');
    expect(schedule).toMatch(/90[- ]day/i);
  });
});

describe('Phase 18 · the testing pyramid (master:4760-4764)', () => {
  const count = (dirs: string[], match: RegExp): number =>
    dirs.reduce((n, d) => n + collectTs(d, (f) => match.test(f)).length, 0);

  const unit = count(
    ['backend/src', 'packages', 'apps/mobile/src', 'apps/web/src'],
    /\.spec\.tsx?$/,
  );
  const integration = count(['backend/test', 'tests/spec-derived'], /\.spec\.ts$/);
  const e2e = count(['tests/e2e/specs', 'apps/mobile/e2e'], /\.spec\.ts$/);
  const load = count(['tests/load'], /\.js$/);

  it('is a pyramid, not a diamond or an ice-cream cone', () => {
    // The spec's 70/20/5/5 cannot be read as file-count percentages: it also names exactly FOUR k6
    // scenarios and twelve E2E journeys, which could never be 5% each of a 500-file estate. What the
    // ratios express is shape — most confidence from fast, isolated tests, least from the slowest
    // and most brittle. That IS checkable, and it is the property that breaks first when a team
    // starts covering behaviour end-to-end because the unit seam is awkward.
    expect(unit).toBeGreaterThan(integration);
    expect(integration).toBeGreaterThan(e2e);
    expect(e2e).toBeGreaterThan(load);
  });

  it('keeps unit tests the clear majority', () => {
    const total = unit + integration + e2e + load;
    expect(unit / total).toBeGreaterThan(0.6);
  });

  it('keeps E2E a thin layer', () => {
    // "critical user journeys only" (master:4763). E2E growing past a tenth of the estate is the
    // signal that it is being used as a substitute for unit coverage.
    const total = unit + integration + e2e + load;
    expect(e2e / total).toBeLessThan(0.1);
  });

  it('has all four layers present', () => {
    // A missing layer is a different failure from a mis-sized one: no load tests at all means the
    // Phase 14 SLA has never been measured.
    for (const layer of [unit, integration, e2e, load]) expect(layer).toBeGreaterThan(0);
  });
});
