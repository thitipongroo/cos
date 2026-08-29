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

  it('CI runs all four scenarios, not one of them', () => {
    // Until 2026-08-29 the weekly job ran api-baseline alone. The dashboard SLA, the upload path and
    // the AI report path had thresholds written down and never executed — while a job named
    // "Load Tests" went green every Monday. The scenarios that were not run are precisely the ones
    // whose numbers nobody could have noticed drifting.
    // Read the RUN loop, not the file. A first version of this searched the whole workflow and
    // passed when the loop was cut back to one scenario, because the other three names still
    // appeared in a comment and in the summary loop below it. A test that a comment can satisfy is
    // not a test.
    const wf = read('.github/workflows/load-tests.yml');
    const runStep = wf.slice(
      wf.indexOf('- name: Run k6 scenarios'),
      wf.indexOf('- name: Upload k6 results'),
    );
    const loop = /for s in ([a-z0-9 -]+); do/.exec(runStep)?.[1]?.split(/\s+/) ?? [];
    expect(loop.sort()).toEqual(['ai-report', 'api-baseline', 'dashboard-sla', 'file-upload']);
  });

  it('a breach in one scenario still leaves the others measured', () => {
    // k6 exits non-zero on a threshold breach. Without the per-scenario capture, the first breach
    // ends the step and the remaining scenarios produce no data at all — the run tells you one thing
    // is wrong and nothing about the rest.
    const wf = read('.github/workflows/load-tests.yml');
    expect(wf).toMatch(/\|\| failed=1/);
    expect(wf).toMatch(/exit "\$failed"/);
  });

  it('there is ONE set of k6 scripts', () => {
    // There were two: tests/load/, which this suite asserted against and CI never ran, and
    // scripts/loadtest/, which CI ran one file from and no test ever read. Each set had something
    // the other lacked and neither was wrong on its own, which is exactly why the split survived —
    // every check that existed passed. Merged into tests/load/ on 2026-08-29.
    expect(exists('scripts/loadtest')).toBe(false);
  });

  it('the mixed-read scenario reads the estate, not the health probes', () => {
    // /health/live answers from memory in single-digit milliseconds. Including it in a P95 over
    // "mixed read endpoints" measures how many probes are in the mix as much as how fast the API is,
    // and it moves the number in the flattering direction.
    const baseline = read('tests/load/api-baseline.js');
    const endpoints = baseline.slice(
      baseline.indexOf('const endpoints = ['),
      baseline.indexOf('];'),
    );
    expect(endpoints).not.toMatch(/\/health\//);
    expect(endpoints).toMatch(/procurement/);
  });

  it('the 5 MB upload payload is built once, not per iteration', () => {
    // Generating it inside the default function measured k6's own string building as upload latency
    // — 100 MB of allocation per round at 20 VUs, on the P95 the threshold is judged against.
    expect(read('tests/load/file-upload.js')).toMatch(/export function setup\(\)/);
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

// ── Where a spec lives is decided by its RUNNER ────────────────────────────
//
// Three jest configs share one filename pattern, `*.spec.ts`, and separate their work two different
// ways: by PATH (`jest.config.js` ignores `<rootDir>/test/`) and by NAME (it also ignores
// `\.workflow\.spec\.ts$`). Because the name is what mostly decides, a file can sit in the wrong
// tree and still be run by the right config — nothing fails, and nothing says anything.
//
// That is exactly what happened. `02-approval-thresholds.workflow.spec.ts` was filed under
// `backend/test/phase-05-procurement/` by PHASE while its four siblings sat beside their module in
// `src/`, and `finance.integration.spec.ts` carried an integration name over a file with 24 doubles
// and no container. Both were found by reading, not by a failing test. These assertions are that
// missing test.

describe('Phase 18 · a spec lives where its runner says, not where its phase does', () => {
  const backendTest = path.join(repoRoot, 'backend/test');
  const backendSrc = path.join(repoRoot, 'backend/src');

  const specsUnder = (root: string): string[] => {
    const out: string[] = [];
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          if (!['node_modules', 'dist', 'coverage'].includes(e.name)) walk(full);
        } else if (/\.spec\.ts$/.test(e.name)) out.push(path.relative(repoRoot, full));
      }
    };
    walk(root);
    return out.sort();
  };

  // Two container entry points are in use here, not one: 39 specs take the backend-local harness
  // (`../helpers/integration-infra`, the one §30 documents) and 5 take the shared package
  // (`@cos/test-utils`, whose startContainers also brings up ClickHouse/Kafka/Schema Registry).
  // Matching only the first read those five as container-less and flagged them — the regex was
  // wrong, not the files.
  const usesContainers = (file: string): boolean =>
    /integration-infra|@cos\/test-utils|PostgreSqlContainer|GenericContainer|RedisContainer/.test(
      codeOnly(fs.readFileSync(path.join(repoRoot, file), 'utf8')),
    );

  it('backend/test holds Testcontainers specs and nothing else', () => {
    // The integration config runs `<rootDir>/test/**` minus `*.workflow.spec.ts`. A spec here that
    // starts no container is either misfiled or misnamed, and either way it is paying container
    // startup and a 120s timeout for a test that does not need them.
    const strays = specsUnder(backendTest).filter((f) => !usesContainers(f));
    expect(strays).toEqual([]);
  });

  it('every Temporal workflow spec sits beside the module it drives', () => {
    // `*.workflow.spec.ts` is excluded from BOTH the unit config and the integration config by name,
    // so jest.workflows.config.js finds it wherever it is. Placement is therefore invisible to the
    // runner and has to be asserted here. They need a TestWorkflowEnvironment, not a container, so
    // they belong with their module in src/ — which is where four of the five already were.
    const misfiled = specsUnder(backendTest).filter((f) => /\.workflow\.spec\.ts$/.test(f));
    expect(misfiled).toEqual([]);
    // CONTROL: they exist somewhere, so the empty list above is a placement fact rather than a
    // vanished category.
    expect(specsUnder(backendSrc).filter((f) => /\.workflow\.spec\.ts$/.test(f)).length).toBe(5);
  });

  it('no spec under src/ claims to be an integration test', () => {
    // src/ is the unit run: 15s timeout, no Docker, 100% line+branch gate. A file named
    // `*.integration.spec.ts` here promises infrastructure the run cannot provide, and the name is
    // what a reader trusts when deciding where a behaviour is covered.
    const liars = specsUnder(backendSrc).filter((f) => /\.integration\.spec\.ts$/.test(f));
    expect(liars).toEqual([]);
  });

  it('§30.2a still describes the layout these assertions enforce', () => {
    // The rules above are only half the fix. The reason the trees drifted in the first place is that
    // NOTHING wrote the rule down: the placement had to be reconstructed from file dates and jest
    // configs, and a reader with no reason to do that had nothing to be wrong about. §30.2a is that
    // missing half, so it is pinned here — a spec section that quietly loses the rule leaves these
    // assertions enforcing something undocumented again.
    const spec = read('docs/specifications/30-testing-strategy.md');
    expect(spec).toContain('## 30.2a Where a test file lives');
    expect(spec).toMatch(/backend\/test\/<module>\/\*\.integration\.spec\.ts/);
    expect(spec).toMatch(/backend\/src\/\*\*\/\*\.workflow\.spec\.ts/);
    // The decision itself, not just the shape: `backend/test/` keeps the NestJS name rather than
    // gaining a k8s-style type layer. Recorded so it is not re-argued from scratch.
    expect(spec).toMatch(/keeps the name the NestJS CLI generates/);
  });

  it('neither tree still groups by phase number', () => {
    // The phase-NN- prefix was a second axis laid over the runner axis on 2026-08-26, and it is what
    // let a workflow spec be filed by phase into the container tree. Folders are named for the
    // module now; nothing reads the prefix, so nothing but this stops it coming back.
    const phaseNamed = [
      ...fs.readdirSync(backendTest, { withFileTypes: true }),
      ...fs.readdirSync(path.join(repoRoot, 'tests/conformance'), { withFileTypes: true }),
    ]
      .filter((e) => e.isDirectory() && /^phase-\d/.test(e.name))
      .map((e) => e.name);
    expect(phaseNamed).toEqual([]);
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

  it('no journey is present as a file and absent as a run', () => {
    // The it.each above only asks whether a FILE exists. A spec whose every test is
    // `test.describe.skip` satisfies it while running nothing, which is how procurement sat skipped
    // long after the UI its note blamed had shipped: the note said "no useCreatePurchaseRequest/
    // approve mutations exist" while the page using that very hook was already in the tree.
    //
    // So: enumerate the UNCONDITIONAL skips — `test.skip('title', …)` and `test.describe.skip(…)`,
    // as opposed to `test.skip(condition, reason)`, which is a real environment gate — and pin the
    // list. A new one fails here and has to be justified; a removed one fails here and has to be
    // taken off the list. Comments are stripped first: a note quoting `test.describe.skip` is not
    // one.
    const dir = path.join(repoRoot, 'tests/e2e/specs');
    const blocked: Record<string, number> = {};
    for (const file of fs.readdirSync(dir)) {
      const body = codeOnly(fs.readFileSync(path.join(dir, file), 'utf8'));
      const count =
        (body.match(/test\.describe\.skip\s*\(/g) ?? []).length +
        // `test.skip(` immediately followed by a string literal = a skipped TEST, not a gate.
        (body.match(/\btest\.skip\s*\(\s*[`'"]/g) ?? []).length;
      if (count > 0) blocked[file] = count;
    }

    // Each entry is a journey that CANNOT run for a reason outside the test estate, recorded with
    // what has to ship before it can. Anything else here is a journey quietly not being tested.
    expect(blocked).toEqual({
      // Blocked on a unified approval-queue UI: /admin holds only the SYSTEM_ADMIN panel, and the
      // 48h → next-approver escalation is a Temporal workflow surfaced through notifications.
      'approval-escalation.spec.ts': 1,
      // Blocked on seeded ClickHouse (analytics.project_cost_daily) for the E2E tenant: against an
      // empty store the dashboard correctly renders "No data available" and the assertion is a lie
      // either way.
      'dashboard.spec.ts': 1,
    });
  });

  it('the approval-queue blocker that keeps a journey skipped is still real', () => {
    // The paired half of the list above: a recorded blocker has to be re-checkable, or the list
    // becomes the next stale note. When someone builds /admin/approvals this fails, and the failure
    // is the instruction — unskip approval-escalation.spec.ts and drop it from the map.
    const adminRoutes = fs.readdirSync(path.join(repoRoot, 'apps/web/src/app/admin'));
    expect(adminRoutes).not.toContain('approvals');
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
  // backend/test holds every Testcontainers integration spec, phase folders included — they run
  // under one config (backend/jest.integration.config.js), which is what makes them one layer.
  const integration = count(['backend/test'], /\.spec\.ts$/);
  const e2e = count(['tests/e2e/specs', 'apps/mobile/e2e'], /\.spec\.ts$/);
  const load = count(['tests/load'], /\.js$/);
  // CONFORMANCE is a fifth layer the master's 70/20/5/5 does not name, because it is not a test of
  // behaviour at all: it reads source as text to check cross-artifact agreement and absence. Counted
  // separately rather than folded into `integration` — where it used to sit, under its old
  // tests/spec-derived path — because folding it in overstated the integration layer and understated
  // the pyramid's base.
  const conformance = count(['tests/conformance'], /\.spec\.ts$/);

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

  it('has all four behavioural layers present', () => {
    // A missing layer is a different failure from a mis-sized one: no load tests at all means the
    // Phase 14 SLA has never been measured.
    for (const layer of [unit, integration, e2e, load]) expect(layer).toBeGreaterThan(0);
  });

  it('has a conformance layer, counted apart from the four the spec names', () => {
    // Deliberately NOT a ratio. master:4760-4764 gives 70/20/5/5 for unit/integration/e2e/load and
    // says nothing about conformance, so any threshold here would be a rule invented by this test
    // rather than one the spec sets — and an invented threshold is how a suite starts pinning
    // wishes instead of requirements. What IS checkable is that the layer exists and is not folded
    // into `integration`, where it used to sit under the old tests/spec-derived path and overstated
    // that layer by 60 files.
    expect(conformance).toBeGreaterThan(0);
  });
});
