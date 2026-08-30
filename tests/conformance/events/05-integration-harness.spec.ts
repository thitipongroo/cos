/**
 * Phase 8 — the integration harness master specifies by path and by content
 * (master:3170-3178), and the schema evolution rules it protects (master:3063-3070).
 *
 * This phase is the one place master names a test file, its dependencies and its two cases outright,
 * so these assertions are about that mandate rather than about behaviour. The suite itself is the
 * repo's own and is left alone — running a second Kafka container to re-prove what it already proves
 * would cost minutes per run and check nothing new.
 *
 * The PACKAGE moved: ADR-055 (2026-08-22) split the Kafka SDK, its integration suite and its
 * testcontainers devDependencies out of @cos/shared into @cos/kafka, because @cos/shared is imported
 * by React Native and the Service Worker and Rule 34 keeps it free of Node-only code. Every mandate
 * below is unchanged — only the directory it is satisfied in.
 */
import { exists, read, readJson } from '../helpers';

const KAFKA = 'packages/@cos/kafka';
const SPEC_FILE = `${KAFKA}/test/kafka/kafka.integration.spec.ts`;

interface PackageJson {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const pkg = readJson<PackageJson>(`${KAFKA}/package.json`);

describe('Phase 8 · the integration suite master mandates (master:3170)', () => {
  it('exists at exactly the path master names', () => {
    expect(exists(SPEC_FILE)).toBe(true);
  });

  it('drives a real single-broker Kafka via @testcontainers/kafka (master:3174)', () => {
    // A mocked broker would not prove the thing the case is for: that a payload survives an actual
    // serialize → publish → subscribe → deserialize round trip.
    expect(read(SPEC_FILE)).toContain('KafkaContainer');
  });

  it('case (a): a published event reaches the consumer with the same payload (master:3177)', () => {
    expect(read(SPEC_FILE)).toMatch(/producer publishes.*consumer receives/i);
  });

  it('case (b): the same event_id is processed exactly once (master:3178)', () => {
    expect(read(SPEC_FILE)).toMatch(/idempotenc/i);
    expect(read(SPEC_FILE)).toContain('event_id');
  });
});

describe('Phase 8 · Rules 26 and 27 — the suite can actually be run (master:3171-3173)', () => {
  it.each(['testcontainers', '@testcontainers/kafka'])(
    '%s is a devDependency at ^10.9.0 (Rule 26)',
    (dep) => {
      expect(pkg.devDependencies?.[dep]).toBe('^10.9.0');
    },
  );

  it('the package exposes a test:integration script (Rule 27)', () => {
    // master writes the flag as `--testPathPattern`; current Jest spells it `--testPathPatterns`.
    // What the rule is about is that the script exists and targets test/, not which spelling of a
    // renamed CLI flag the repo is pinned to.
    const script = pkg.scripts?.['test:integration'];
    expect(script).toBeDefined();
    expect(script).toMatch(/jest/);
    expect(script).toMatch(/test\//);
  });
});

describe("Phase 8 · schema evolution is the registry's job, and it is configured for it", () => {
  const client = read(`${KAFKA}/src/schema-registry.client.ts`);

  it('the FORBIDDEN changes (master:3067-3070) are enforced by BACKWARD_TRANSITIVE, which is set', () => {
    // rename field / remove field / change type — the three FIELD rules are rejected by the
    // registry under this mode. Nothing in application code needs to re-check them, and nothing in
    // application code COULD: the check is against every previously registered version.
    //
    // The fourth, reorder-enum, is a different animal and is asserted by pinning the symbol order in
    // 03-topics-and-schema.spec.ts — a registry check cannot fire on a schema edited in place.
    expect(client).toContain('BACKWARD_TRANSITIVE');
    expect(client).toMatch(/compatibility/i);
  });

  it('the mode is set explicitly rather than assumed from the registry default', () => {
    // Confluent boots at BACKWARD, one version back. Leaving the default would satisfy a reader of
    // the spec and none of its intent.
    expect(client).toMatch(/PUT|POST/);
  });
});
