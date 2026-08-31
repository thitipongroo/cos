/**
 * Phase 8 — Schema Registry configuration. CONFORMANCE only.
 *
 * Topic naming, subject naming, the per-tenant DLQ derivation, the consumer pattern and the
 * entity-state compaction keys are all asserted by
 * packages/@cos/kafka/src/__tests__/topic-catalog.spec.ts — against the same functions, and
 * with cases this file never had (a quantifier cannot widen the pattern; one tenant's failures
 * never reach another tenant's DLQ). They were removed from here on 2026-08-25 because this file
 * IMPORTED and executed the package, which made them unit tests living outside the package they
 * test. The entity-state block moved there wholesale rather than being deleted.
 *
 * What is left reads a FILE no package test opens, to assert a registry setting that is invisible
 * at runtime until the day an incompatible schema is accepted.
 */
import * as fs from 'fs';
import * as path from 'path';

import { abs, read } from '../helpers';

const AVRO_DIR = 'packages/@cos/kafka/src/avro';

describe('the Schema Registry is set to BACKWARD_TRANSITIVE (master:3057, 3063-3070)', () => {
  const client = read('packages/@cos/kafka/src/schema-registry.client.ts');

  it('sets the compatibility mode explicitly', () => {
    // The registry DEFAULTS to BACKWARD, which only guarantees a consumer against the immediately
    // preceding version. The stricter mode has to be set, and nothing at runtime distinguishes the
    // two until a schema three versions old stops deserialising.
    expect(client).toMatch(/compatibility/i);
    expect(client).toContain('BACKWARD_TRANSITIVE');
  });

  it('is what mechanises the FORBIDDEN change list', () => {
    // master:3063-3070 forbids rename / remove / retype / reorder-enum. The three FIELD rules are
    // what BACKWARD_TRANSITIVE rejects, so they are enforced by the registry rather than by code
    // review, and this asserts the mode is actually set rather than assumed.
    //
    // Reorder-enum is NOT covered here, whatever this comment claimed before 2026-08-26: an .avsc
    // edited in place keeps its registered id, so no compatibility check ever runs, and Avro reads
    // enums by index. That rule is enforced instead by the pinned symbol order further down.
    expect(client).toContain('BACKWARD_TRANSITIVE');
  });
});

/**
 * master:3065-3070 — the schema EVOLUTION rules.
 *
 *     ALLOWED:   add optional field with default value
 *     ALLOWED:   add new enum value (at end of enum list)
 *     FORBIDDEN: rename field / remove field / change field type / reorder enum values
 *
 * Until 2026-08-26 the only thing asserted here was that BACKWARD_TRANSITIVE is configured, on the
 * argument that the registry mechanises the list. That holds for the field rules. It does NOT hold
 * for enum ORDER, and the gap is not theoretical — run this against avsc 5.7.9, the encoder behind
 * @kafkajs/confluent-schema-registry:
 *
 *     A = enum ['DRAFT','APPROVED','CANCELLED']      B = enum ['APPROVED','DRAFT','CANCELLED']
 *     A writes 'DRAFT'     -> byte 0x00 -> B reads 'APPROVED'
 *     A writes 'APPROVED'  -> byte 0x02 -> B reads 'DRAFT'
 *
 * No exception, no warning: an Avro enum travels the wire as its INDEX, so swapping two symbols
 * silently swaps their meaning in every message already written. On PoStatus that turns an
 * unapproved purchase order into an approved one. A registry check cannot save an .avsc edited in
 * place under an id that is already registered, which is exactly how a reorder happens.
 *
 * So the order is pinned here. The comparison is a PREFIX check, which is precisely the spec's two
 * rules in one mechanism: appending a symbol at the end stays green (master:3066 ALLOWED), while
 * reordering, inserting or removing one turns red (master:3070, 3068 FORBIDDEN).
 */
const ENUM_SYMBOL_ORDER: Record<string, readonly string[]> = {
  CashflowDetectedBy: ['AI_FORECAST', 'RULE_ENGINE'],
  CheckinMethod: ['QR_CODE', 'GPS', 'BIOMETRIC', 'MANUAL'],
  ConflictType: ['FIELD_CONFLICT', 'STATUS_CONFLICT', 'REJECTED'],
  DelayCause: ['PROCUREMENT', 'WEATHER', 'WORKFORCE', 'EQUIPMENT', 'SCOPE_CHANGE', 'OTHER'],
  DelaySeverity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  DetectedBy: ['AI_FORECAST', 'MANUAL_REPORT'],
  GHGScope: ['SCOPE_1', 'SCOPE_2', 'SCOPE_3'],
  IncidentSeverity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  IssueEscalatedSeverity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  IssueSeverity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  IssueStatus: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  ModelType: ['DELAY_FORECAST', 'COST_OVERRUN', 'SAFETY_VISION', 'RISK_CLASSIFIER'],
  PlanType: ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'],
  PoStatus: [
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'SENT',
    'ACKNOWLEDGED',
    'PARTIALLY_DELIVERED',
    'FULLY_DELIVERED',
    'INVOICED',
    'PAID',
    'DISPUTED',
  ],
  ProjectType: ['RESIDENTIAL', 'COMMERCIAL', 'INFRASTRUCTURE', 'INDUSTRIAL'],
  RfqStatus: ['DRAFT', 'PUBLISHED', 'CLOSED', 'EVALUATED', 'AWARDED', 'CANCELLED'],
  RiskLevel: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  // The platform's own rules finding a safety requirement unmet. Named SafetyViolationType
  // until the merge of 2026-08-31 gave `safety.violation.detected.v1` to SafetyVisionModel;
  // this enum moved with the event to `safety.compliance.failed.v1` (§32.4 row 23).
  SafetyComplianceFailureType: ['PERMIT_EXPIRED', 'CHECKLIST_ITEM_FAILED'],
  SeverityLevel: ['LOW', 'MEDIUM', 'HIGH'],
  StateSource: ['IOT', 'MANUAL', 'AI_INFERRED'],
  ViolationSeverity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
};

describe('Avro enums may only ever grow at the end (master:3066, 3070)', () => {
  const declared = (): Map<string, string[]> => {
    const found = new Map<string, string[]>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node !== 'object' || node === null) return;
      const obj = node as Record<string, unknown>;
      if (obj['type'] === 'enum' && typeof obj['name'] === 'string') {
        found.set(obj['name'], obj['symbols'] as string[]);
      }
      Object.values(obj).forEach(walk);
    };
    for (const file of fs.readdirSync(abs(AVRO_DIR)).filter((f) => f.endsWith('.avsc'))) {
      walk(JSON.parse(fs.readFileSync(path.join(abs(AVRO_DIR), file), 'utf8')));
    }
    return found;
  };

  it('finds the enums — a rename of the directory must not silently empty this suite', () => {
    expect(declared().size).toBe(Object.keys(ENUM_SYMBOL_ORDER).length);
  });

  it.each(Object.keys(ENUM_SYMBOL_ORDER))('%s keeps its pinned symbol order', (name) => {
    const actual = declared().get(name);
    expect(actual).toBeDefined();
    const pinned = ENUM_SYMBOL_ORDER[name]!;
    // Prefix, not equality: the tail is free to grow, the head can never move.
    expect(actual!.slice(0, pinned.length)).toEqual(pinned);
  });

  it('every enum in the schemas is pinned, so a new one cannot arrive unwatched', () => {
    expect([...declared().keys()].sort()).toEqual(Object.keys(ENUM_SYMBOL_ORDER).sort());
  });
});

describe('Avro optional fields carry a default (master:3065)', () => {
  // "ALLOWED: add optional field with default value" is only true of a schema whose optional fields
  // ALREADY have defaults — a nullable field without one cannot be read by a consumer that predates
  // it, so the change the spec calls allowed is rejected. All 63 schemas satisfy this today and
  // nothing was checking it; the first hand-written .avsc that omits `"default": null` breaks the
  // evolution guarantee for its whole subject and nothing else would notice.
  const offenders = (): string[] => {
    const bad: string[] = [];
    const walk = (node: unknown, file: string): void => {
      if (Array.isArray(node)) {
        node.forEach((n) => walk(n, file));
        return;
      }
      if (typeof node !== 'object' || node === null) return;
      const obj = node as Record<string, unknown>;
      if (obj['type'] === 'record' && Array.isArray(obj['fields'])) {
        for (const f of obj['fields'] as Array<Record<string, unknown>>) {
          const t = f['type'];
          const optional = Array.isArray(t) && (t as unknown[]).includes('null');
          if (optional && !('default' in f)) bad.push(`${file}:${String(f['name'])}`);
        }
      }
      Object.values(obj).forEach((v) => walk(v, file));
    };
    for (const file of fs.readdirSync(abs(AVRO_DIR)).filter((f) => f.endsWith('.avsc'))) {
      walk(JSON.parse(fs.readFileSync(path.join(abs(AVRO_DIR), file), 'utf8')), file);
    }
    return bad;
  };

  it('reads the schema directory', () => {
    expect(fs.readdirSync(abs(AVRO_DIR)).filter((f) => f.endsWith('.avsc')).length).toBeGreaterThan(
      50,
    );
  });

  it('has no nullable field without a default', () => {
    expect(offenders()).toEqual([]);
  });
});
