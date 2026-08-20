// The Detox CI job's wiring, checked statically — the same technique as routeRegistry.spec.ts and
// authStackRegistry.spec.ts: read the files rather than run the thing.
//
// WHY THIS EXISTS. `mobile-e2e-tests` has never executed. It is gated to the `staging` branch and
// waits on seven repository secrets that do not exist yet, so its FIRST real run will be its first
// verification — on a sixty-minute Android-emulator job, after someone has gone to the trouble of
// creating those secrets. Everything about it that can be checked without an emulator should
// therefore be checked here, because the alternative is finding a typo an hour into a staging run.
//
// THE THREE AGREEMENTS THIS PROTECTS, all of which are string equality across separate files and
// none of which any compiler or linter can see:
//
//   1. The AVD NAME. `.detoxrc.js` looks up `process.env.DETOX_AVD_NAME`; the workflow sets it and
//      separately tells android-emulator-runner what to CALL the AVD it creates. Two spellings and
//      Detox waits for an emulator the runner never made.
//   2. THE SECRETS COVER WHAT THE SPECS READ. Each spec falls back to a local default
//      (`|| '+66800000001'`), so a missing secret does not crash — it silently runs the suite
//      against a phone number that does not exist on staging, and the failure surfaces as a login
//      timeout with nothing pointing at the cause.
//   3. THE SPECS THE JOB NAMES EXIST. The job lists three by path; a renamed file makes Detox exit
//      having run nothing, which reads as a pass in a job whose whole purpose is to run them.
//
// It deliberately does NOT check that the job works. It checks that the parts refer to each other.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MOBILE = join(__dirname, '..', '..', '..');
const REPO = join(MOBILE, '..', '..');

const workflow = readFileSync(join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8');
const detoxrc = readFileSync(join(MOBILE, '.detoxrc.js'), 'utf8');

/** The `mobile-e2e-tests` job's own block, up to the next top-level key. */
function e2eJob(): string {
  const start = workflow.indexOf('\n  mobile-e2e-tests:');
  if (start === -1) return '';
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next);
}

const job = e2eJob();

/** Spec paths the job hands to `detox test`. */
function namedSpecs(): string[] {
  return [...job.matchAll(/e2e\/[\w-]+\.spec\.ts/g)].map((m) => m[0]);
}

/** `E2E_*` variables the job supplies. */
function suppliedVars(): Set<string> {
  return new Set([...job.matchAll(/^\s{10,}(E2E_[A-Z_]+):/gm)].map((m) => m[1]!));
}

/** `E2E_*` variables a spec reads, whatever its fallback. */
function readVars(file: string): string[] {
  const source = readFileSync(join(MOBILE, file), 'utf8');
  return [...source.matchAll(/process\.env\['(E2E_[A-Z_]+)'\]/g)].map((m) => m[1]!);
}

describe('the Detox CI job refers to things that exist', () => {
  it('finds the job, so an empty read cannot pass silently', () => {
    expect(job).not.toBe('');
    expect(job).toContain('detox test');
  });

  // The job's whole purpose. A renamed spec makes Detox exit having run nothing.
  it('names at least the three functional specs', () => {
    expect(namedSpecs().length).toBeGreaterThanOrEqual(3);
  });

  it('names only specs that exist on disk', () => {
    const missing = namedSpecs().filter((spec) => !existsSync(join(MOBILE, spec)));

    expect(missing).toEqual([]);
  });

  // The capture and benchmark specs are local tools, not CI: one drives screenshot capture and the
  // other is a throughput probe, and neither asserts a product rule.
  it('leaves the local-only specs out of CI', () => {
    expect(namedSpecs()).not.toContain('e2e/capture.spec.ts');
    expect(namedSpecs()).not.toContain('e2e/benchmark.spec.ts');
  });

  // ── THE AVD NAME ─────────────────────────────────────────────────────────────────────────────

  it('reads the AVD name from the environment rather than pinning one', () => {
    expect(detoxrc).toContain('DETOX_AVD_NAME');
  });

  // Two spellings and Detox waits for an emulator the runner never made — for the full sixty
  // minutes, since it has no way to tell "not booted yet" from "does not exist".
  it('tells Detox the same AVD name the runner is told to create', () => {
    const exported = /DETOX_AVD_NAME:\s*(\S+)/.exec(job)?.[1];
    const created = /avd-name:\s*(\S+)/.exec(job)?.[1];

    expect(exported).toBeDefined();
    expect(created).toBeDefined();
    expect(exported).toBe(created);
  });

  // ── THE CONFIGURATION ────────────────────────────────────────────────────────────────────────

  it('builds and runs a configuration .detoxrc.js declares', () => {
    const used = [...job.matchAll(/--configuration\s+(\S+)/g)].map((m) => m[1]!);

    expect(used.length).toBeGreaterThan(0);
    for (const configuration of used) {
      expect(detoxrc).toContain(`'${configuration}'`);
    }
  });

  // The DEBUG variant deliberately: Detox's instrumentation runtime is proguard-stripped from the
  // release APK, so its ready handshake never completes there. A job switched to release would hang
  // rather than fail, which is the worst way for this to go wrong.
  it('runs the debug variant, whose Detox runtime survives the build', () => {
    expect(job).toContain('android.emu.debug');
    expect(job).not.toContain('android.emu.release');
  });

  // ── THE SECRETS ──────────────────────────────────────────────────────────────────────────────

  // Every spec falls back to a local default, so a missing secret does not crash — it runs the suite
  // against a phone number that does not exist on staging, and the failure looks like a login
  // timeout with nothing pointing at the cause.
  it('supplies every E2E variable the specs it runs actually read', () => {
    const supplied = suppliedVars();
    const needed = new Set(namedSpecs().flatMap(readVars));

    const unmet = [...needed].filter((name) => !supplied.has(name));

    expect(unmet).toEqual([]);
  });

  // And nothing beyond them: a variable the job sets that no spec reads is a secret somebody was
  // asked to create for nothing.
  it('supplies nothing the specs do not read', () => {
    const needed = new Set(namedSpecs().flatMap(readVars));

    const unused = [...suppliedVars()].filter((name) => !needed.has(name));

    expect(unused).toEqual([]);
  });

  // ── THE APP UNDER TEST ───────────────────────────────────────────────────────────────────────

  // EXPO_PUBLIC_E2E is inlined into the bundle at BUILD time, not read at runtime — so it has to be
  // set on the steps that produce the APK. Without it `isE2EEnabled()` is false in the built app and
  // the deep links the helpers send are ignored, which is a suite that cannot go offline or reset a
  // session and has no way to say so.
  it('builds the app with the E2E flag on', () => {
    // Split on the step boundary, then match on each chunk's NAME LINE only. Matching anywhere in
    // the chunk picks up the trailing COMMENT that introduces the next step, so the install step
    // counted as a build step and was asserted to carry a flag it has no reason to.
    // Matched on each step's own `run:` COMMAND, not on its text: a step chunk runs up to the
    // next step's `- name:`, so it carries that step's leading COMMENT at its tail — and the
    // comment above the prebuild step says the word "prebuild". Matching text made the install
    // step count as a build step and demanded a flag it has no reason to carry.
    const buildSteps = job
      .split('- name:')
      .slice(1)
      .filter((step) => /run:\s*pnpm exec (expo prebuild|detox build)/.test(step));

    expect(buildSteps.length).toBeGreaterThanOrEqual(2);
    for (const step of buildSteps) {
      expect(step).toContain('EXPO_PUBLIC_E2E');
    }
  });

  // Staging only. These specs sign in as real users and write real rows; running them against
  // anything else is a suite doing damage rather than finding it.
  it('runs on staging and nowhere else', () => {
    expect(job).toContain("github.ref == 'refs/heads/staging'");
  });

  // The artefacts are the only evidence a headless emulator run leaves behind.
  it('keeps the artefacts when it fails', () => {
    expect(job).toContain('upload-artifact');
    expect(job).toContain('if: failure()');
  });
});
