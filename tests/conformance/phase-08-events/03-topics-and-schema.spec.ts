/**
 * Phase 8 — Schema Registry configuration. CONFORMANCE only.
 *
 * Topic naming, subject naming, the per-tenant DLQ derivation, the consumer pattern and the
 * entity-state compaction keys are all asserted by
 * packages/@cos/shared/src/kafka/__tests__/topic-catalog.spec.ts — against the same functions, and
 * with cases this file never had (a quantifier cannot widen the pattern; one tenant's failures
 * never reach another tenant's DLQ). They were removed from here on 2026-08-25 because this file
 * IMPORTED and executed the package, which made them unit tests living outside the package they
 * test. The entity-state block moved there wholesale rather than being deleted.
 *
 * What is left reads a FILE no package test opens, to assert a registry setting that is invisible
 * at runtime until the day an incompatible schema is accepted.
 */
import { read } from '../helpers';

describe('the Schema Registry is set to BACKWARD_TRANSITIVE (master:3057, 3063-3070)', () => {
  const client = read('packages/@cos/shared/src/kafka/schema-registry.client.ts');

  it('sets the compatibility mode explicitly', () => {
    // The registry DEFAULTS to BACKWARD, which only guarantees a consumer against the immediately
    // preceding version. The stricter mode has to be set, and nothing at runtime distinguishes the
    // two until a schema three versions old stops deserialising.
    expect(client).toMatch(/compatibility/i);
    expect(client).toContain('BACKWARD_TRANSITIVE');
  });

  it('is what mechanises the FORBIDDEN change list', () => {
    // master:3063-3070 forbids rename / remove / retype / reorder-enum. Those are precisely what
    // BACKWARD_TRANSITIVE rejects — so the rule is enforced by the registry rather than by code
    // review, and this asserts the mode is actually set rather than assumed. The alternative is a
    // list in a spec document that nothing checks.
    expect(client).toContain('BACKWARD_TRANSITIVE');
  });
});
