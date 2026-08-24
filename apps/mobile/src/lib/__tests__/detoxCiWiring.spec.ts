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

import { readFileSync, existsSync, readdirSync } from 'node:fs';
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

/**
 * Every literal `by.id('...')` a spec drives.
 *
 * Literal only. A spec that builds an id — `by.id(`item-${n}`)` — is matched against the app by the
 * same template on the other side, and neither half is a string this can compare.
 */
function drivenIds(file: string): string[] {
  const source = readFileSync(join(MOBILE, file), 'utf8');
  return [...source.matchAll(/by\.id\('([^']+)'\)/g)].map((m) => m[1]!);
}

/** Everything under src/ that could carry a testID, minus the tests and mocks. */
function appSource(): string {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        return entry.name === '__tests__' || entry.name === '__mocks__' ? [] : walk(full);
      }
      return /\.tsx?$/.test(entry.name) ? [readFileSync(full, 'utf8')] : [];
    });
  return walk(join(MOBILE, 'src')).join('\n');
}

/**
 * Does the app carry this testID, literally or as the tail of a template?
 *
 * `country-option-th` is written `` `country-option-${item.iso2}` `` and
 * `drawer-link-/inspections` is `` `drawer-link-${link.route}` ``, so the prefix is what exists in
 * the source. Matching the whole id would report both as missing, which is a false alarm that
 * teaches people to ignore this test.
 *
 * KNOWN LIMIT, AND IT HAS ALREADY BITTEN ONCE. A prefix match cannot tell a real id from one that
 * merely shares a template's head: `conflict-badge` was cleared by sync-queue.tsx's
 * `` `conflict-${r.conflict_id}` `` even though nothing rendered that id, because a conflict whose
 * id was literally "badge" would produce it. Nothing static can settle that. It was fixed on the
 * other side instead — <ConflictBadge /> now carries the id as a real default — and the lesson is
 * that this check can MISS a missing id, never invent one. Treat a pass as "found nothing", not as
 * "everything is wired".
 */
function appHasId(id: string, source: string): boolean {
  if (source.includes(`'${id}'`) || source.includes(`"${id}"`)) return true;
  for (let cut = id.length; cut > 3; cut--) {
    if (source.includes('`' + id.slice(0, cut) + '${')) return true;
  }
  return false;
}

/** `E2E_*` variables a spec reads, whatever its fallback. */
function readVars(file: string): string[] {
  const source = readFileSync(join(MOBILE, file), 'utf8');
  return [...source.matchAll(/process\.env\['(E2E_[A-Z_]+)'\]/g)].map((m) => m[1]!);
}

/**
 * Controls a CI spec drives that the app does not render.
 *
 * EMPTY, AND ONLY EVER SHRINKS. It held `check-in-button` until 2026-08-21: self check-in was
 * removed from the product on 2026-08-09 while `e2e/offline-checkin.spec.ts` went on driving it, so
 * two of that spec's tests would have failed this job and two passed having checked nothing. The
 * product owner retired the spec with the feature, so the divergence is gone rather than tolerated.
 *
 * A list longer than what is found fails the ratchet below — slack here is room for the next
 * divergence to arrive unnoticed.
 */
const KNOWN_MISSING: readonly string[] = [];

describe('the Detox CI job refers to things that exist', () => {
  it('finds the job, so an empty read cannot pass silently', () => {
    expect(job).not.toBe('');
    expect(job).toContain('detox test');
  });

  // The job's whole purpose. A renamed spec makes Detox exit having run nothing.
  //
  // TWO since 2026-08-21, when offline-checkin was retired with the feature it drove. Asserted as a
  // floor rather than an exact count: a spec ADDED to the job is a good thing that should not need
  // this file edited, while the job silently dropping to one is not.
  it('names at least the two functional specs', () => {
    expect(namedSpecs().length).toBeGreaterThanOrEqual(2);
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

  // ── THE CONTROLS THE SPECS DRIVE ─────────────────────────────────────────────────────────────
  //
  // A testID that no longer exists in the app is the failure this job is LEAST able to explain. Two
  // shapes, and the quiet one is worse:
  //
  //   UNGUARDED  `waitFor(element(by.id('x'))).toBeVisible()` — fails after its timeout, on a
  //              sixty-minute emulator job, reading like a product bug.
  //   GUARDED    `if (await isVisible(x)) { … }` — the block never runs, the test PASSES, and the
  //              thing it was written to prove is never checked again.
  //
  // Detox cannot see this; neither can the compiler. Reading both sides can.
  it('drives only controls the app still renders', () => {
    const source = appSource();
    const missing = [...new Set(namedSpecs().flatMap(drivenIds))].filter(
      (id) => !appHasId(id, source),
    );

    expect(missing.sort()).toEqual([...KNOWN_MISSING].sort());
  });

  // A RATCHET, like the a11y baseline and the radius ceiling: the list may only shrink. If it is
  // longer than what is found, someone fixed a divergence and left the slack behind — and slack is
  // room for the next one to arrive unnoticed.
  it('carries no stale entry in its known-missing list', () => {
    const source = appSource();
    const driven = new Set(namedSpecs().flatMap(drivenIds));

    const stale = KNOWN_MISSING.filter((id) => !driven.has(id) || appHasId(id, source));

    expect(stale).toEqual([]);
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
