/**
 * Phase 19 — the production-readiness gate (master:4867-5028).
 *
 * Most of this phase runs against a live cluster: kubectl, aws, curl to Prometheus and Grafana.
 * None of that exists here and none of it should. What IS checkable offline is the MECHANISM that
 * will do the checking — whether every [AUTO] item has an implementation, and whether the gate can
 * report success without having verified anything. The second question matters more: a readiness
 * script that exits 0 on a machine with no tooling certifies a platform nobody looked at.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, repoRoot } from '../helpers';

const readinessDir = 'scripts/readiness';
const verifyScript = `${readinessDir}/verify-production-readiness.sh`;
const verify = read(verifyScript);

/** Every [AUTO] checklist line in master's Phase 19 Section A — the legend line is not one. */
const specAutoItems = ((): string[] => {
  const master = read('context/00_master_construction_os.md');
  const start = master.indexOf('## PHASE 19');
  const end = master.indexOf('## PHASE 20');
  return master
    .slice(start, end)
    .split('\n')
    .filter((l) => /\[AUTO\]\s+\[ \]/.test(l))
    .map((l) => l.replace(/.*\[AUTO\]\s+\[ \]\s*/, '').trim());
})();

describe('Phase 19 · the verification script (master:4877)', () => {
  it('exists at the path master names', () => {
    // master:4877 said `scripts/verify-production-readiness.sh` until 2026-08-24; the script has
    // always lived beside the check-*.sh files it calls. A path nobody can follow is a gate nobody
    // runs.
    expect(exists(verifyScript)).toBe(true);
    expect(read('context/00_master_construction_os.md')).toContain(
      'scripts/readiness/verify-production-readiness.sh',
    );
  });

  it('is executable', () => {
    const mode = fs.statSync(path.join(repoRoot, verifyScript)).mode;
    expect(mode & 0o111).not.toBe(0);
  });

  it('implements one check per [AUTO] item in the spec', () => {
    // The legend line "[AUTO] = verified automatically…" is not a checklist entry — counting it
    // gives 32 and makes a complete script look one short.
    const implemented = new Set([...verify.matchAll(/AUTO-(\d+)/g)].map((m) => Number(m[1])));
    expect(specAutoItems.length).toBeGreaterThan(25);
    expect(implemented.size).toBe(specAutoItems.length);
  });

  it('numbers them contiguously from 1', () => {
    // A gap means an item was removed without renumbering, and the next reader cannot tell whether
    // the missing number is an oversight or a deliberate deletion.
    const ids = [...new Set([...verify.matchAll(/AUTO-(\d+)/g)].map((m) => Number(m[1])))].sort(
      (a, b) => a - b,
    );
    expect(ids[0]).toBe(1);
    expect(ids[ids.length - 1]).toBe(ids.length);
  });

  it('states its own check count correctly', () => {
    // The header claimed 30, context.md claimed 30, and a comment elsewhere still said 39 — three
    // numbers for one script. All corrected 2026-08-24.
    const stated = /Runs all (\d+) \[AUTO\] checks/.exec(verify);
    expect(stated).not.toBeNull();
    expect(Number(stated![1])).toBe(specAutoItems.length);
    expect(read('context.md')).toMatch(
      new RegExp(`Auto-verify ${specAutoItems.length} \\[AUTO\\] checks`),
    );
  });
});

describe('Phase 19 · a skipped check is not a passed check', () => {
  /** Run the summary logic in isolation with injected counters. */
  const summaryExit = (pass: number, fail: number, skip: number, env: string): number => {
    const block = verify.slice(verify.indexOf('# A SKIPPED CHECK IS NOT A PASSED CHECK'));
    const script = `#!/usr/bin/env bash\nset -uo pipefail\nPASS=${pass}\nFAIL=${fail}\nSKIP=${skip}\nENV=${env}\n${block}`;
    const tmp = path.join(repoRoot, 'node_modules', '.cache', `readiness-summary.sh`);
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, script, { mode: 0o755 });
    try {
      execFileSync('bash', [tmp], { stdio: 'pipe' });
      return 0;
    } catch (err) {
      return (err as { status?: number }).status ?? -1;
    }
  };

  it('refuses to certify a run where everything was skipped', () => {
    // THE BUG THIS REPLACED. The script printed "All checks passed (or skipped due to missing
    // tools)" and exited 0. On a CI runner or a laptop — no kubectl, no aws, no curl — every check
    // skips, and the exit code, which is the part a machine reads, said the platform was verified.
    expect(summaryExit(0, 0, 31, 'staging')).toBe(1);
    expect(summaryExit(0, 0, 31, 'production')).toBe(1);
  });

  it('allows a few skips outside production', () => {
    // Control: if the guard rejected every skip everywhere, nobody could run it from a workstation
    // and it would simply stop being used.
    expect(summaryExit(28, 0, 3, 'staging')).toBe(0);
  });

  it('accepts no skips at all when certifying production', () => {
    // Production readiness is asserted on evidence. One unverified check is one claim nobody made.
    expect(summaryExit(28, 0, 3, 'production')).toBe(1);
    expect(summaryExit(31, 0, 0, 'production')).toBe(0);
  });

  it('still fails on a real failure', () => {
    expect(summaryExit(20, 1, 10, 'staging')).toBe(1);
  });

  it('passes the environment down to the child scripts', () => {
    // The check-*.sh run as separate processes and ENV arrives from `--env`, so it can never be
    // inherited — without an export, check-data.sh falls back to "staging" and keeps applying the
    // 7-day backup floor to production.
    expect(verify).toMatch(/^export ENV$/m);
  });
});

describe('Phase 19 · backup retention matches the policy (master:4922)', () => {
  const checkData = read(`${readinessDir}/check-data.sh`);

  it('requires 30 days in production', () => {
    // "automated backups enabled (daily, 30-day retention)", and docs/runbooks/db-failover.md
    // records the same split. The check compared against 7 everywhere until 2026-08-24, so a
    // production instance holding a week of backups passed the gate.
    expect(checkData).toMatch(/min_retention=30/);
    expect(checkData).toMatch(/ENV.*==.*"production"/);
  });

  it('keeps 7 days for other environments', () => {
    expect(checkData).toMatch(/min_retention=7/);
  });

  it('the runbook states the same split', () => {
    // Two documents disagreeing about a backup window is how one of them gets implemented.
    expect(read('docs/runbooks/db-failover.md')).toMatch(/30 days \(production\).*7 days/);
  });
});

describe('Phase 19 · runbooks and records (master:5009-5021)', () => {
  it.each([
    'production-readiness.md',
    'deployment.md',
    'rollback.md',
    'incident-response.md',
    'disaster-recovery.md',
  ])('docs/runbooks/%s exists', (file) => {
    expect(exists(`docs/runbooks/${file}`)).toBe(true);
  });

  it('the DR runbook commits to RTO 30 minutes and RPO 15 minutes', () => {
    // Both are "confirmed by product owner" in master. A runbook without the numbers cannot be
    // audited against them.
    const dr = read('docs/runbooks/disaster-recovery.md');
    expect(dr).toMatch(/RTO[^\n]*30 minutes/);
    expect(dr).toMatch(/RPO[^\n]*15 minutes/);
  });

  it('the architecture is documented with a service interaction view', () => {
    expect(exists('docs/architecture/service-interaction.md')).toBe(true);
  });

  it.each(['runtime', 'keycloak', 'temporal', 'k6|load', 'clickhouse'])(
    'an ADR covers %s',
    (topic) => {
      const adrs = fs.readdirSync(path.join(repoRoot, 'docs/architecture/adr')).join('\n');
      expect(adrs).toMatch(new RegExp(topic, 'i'));
    },
  );

  it('cos-audit/ is committed with its contents ignored', () => {
    // The directory has to EXIST for run-all-checks.sh to write sign-off logs into it; git cannot
    // commit an empty directory, hence the .gitkeep.
    expect(exists('cos-audit/.gitkeep')).toBe(true);
    expect(read('.gitignore')).toMatch(/cos-audit\//);
  });

  it('docs/slo/monthly-reviews/ is committed the same way', () => {
    expect(exists('docs/slo/monthly-reviews/.gitkeep')).toBe(true);
  });

  it('the adoption gates have a dashboard (master:5019)', () => {
    // SECTION B's eight gates are measured from live usage, not from code — so what is checkable
    // here is that something tracks them.
    expect(exists('infrastructure/monitoring/grafana/dashboards/adoption-gates.json')).toBe(true);
    expect(() =>
      JSON.parse(read('infrastructure/monitoring/grafana/dashboards/adoption-gates.json')),
    ).not.toThrow();
  });
});

describe('Phase 19 · CI still owns none of the deployment (master:4960-4961)', () => {
  it('no workflow runs kubectl apply or helm upgrade', () => {
    // Restated here as a readiness condition, not only a Phase 17 rule: ArgoCD is the only writer,
    // and a pipeline that deploys makes the cluster diverge from git.
    const workflows = fs
      .readdirSync(path.join(repoRoot, '.github/workflows'))
      .filter((f) => /\.ya?ml$/.test(f))
      .map((f) => read(`.github/workflows/${f}`))
      .join('\n')
      .replace(/^\s*#[^\n]*$/gm, ' ');
    expect(workflows).not.toMatch(/kubectl\s+apply/);
    expect(workflows).not.toMatch(/helm\s+upgrade/);
  });
});
