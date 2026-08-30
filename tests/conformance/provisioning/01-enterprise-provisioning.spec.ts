/**
 * Phase 25 — Enterprise Provisioning (master:5721-5777).
 *
 * This phase creates infrastructure and moves a tenant's data onto it. Everything that can go wrong
 * here is expensive and slow to undo: a duplicate RDS instance nobody notices for a month, a human
 * gate that times out and migrates data nobody approved, a webhook that accepts an unsigned request.
 * So the assertions lean on the guarantees rather than the plumbing.
 *
 * The webhook's four failure modes are tested separately on purpose. master:5762 assigns two
 * different status codes for two different meanings — 500 when the SERVER is misconfigured, 401 when
 * the CALLER is not trusted — and collapsing them into "rejects bad requests" would let a
 * missing secret read as an authentication failure and send someone hunting the wrong problem.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { exists, read, readYaml, abs } from '../helpers';

const controller = read('backend/src/modules/platform-webhook/platform-webhook.controller.ts');
const tenantService = read('backend/src/modules/tenant/tenant.service.ts');
const workflow = read('backend/src/modules/tenant/workflows/enterprise-provisioning.workflow.ts');
const activities = read(
  'backend/src/modules/tenant/workflows/enterprise-provisioning.activities.ts',
);

// ── 1. The two triggers ─────────────────────────────────────────────────────

// The two entry points and the four webhook failure modes were asserted here by reading the
// controller and the HMAC helper. backend/test/provisioning/01-provisioning-entry
// .integration now drives both over real HTTP on the same Fastify adapter main.ts uses, with
// { rawBody: true } — which is what separates master:5762's two answers in practice: 500 when the
// SERVER has no secret, 401 when the CALLER cannot be trusted. It also proves a valid signature
// replayed against a different body is refused, which no source scan can state. Dropped 2026-08-25.

describe('Phase 25 · workflow shape (master:5731-5744)', () => {
  const named: Array<[string, RegExp]> = [
    ['createRdsActivity', /export async function createRdsActivity/],
    ['runMigrationsActivity', /export async function runMigrationsActivity/],
    ['assignDedicatedDbActivity', /export async function assignDedicatedDbActivity/],
    ['migrateDataActivity', /export async function migrateDataActivity/],
    ['verifyRoutingActivity', /export async function verifyRoutingActivity/],
  ];

  it.each(named)('has %s', (_name, pattern) => {
    expect(activities).toMatch(pattern);
  });

  it('runs them in the order the spec lists', () => {
    const order = ['createRdsActivity', 'runMigrationsActivity', 'assignDedicatedDbActivity'];
    const positions = order.map((a) => workflow.indexOf(`acts.${a}`));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('compensates createRds and assignDedicatedDb, and NOT migrateData', () => {
    // master:5744 — "migrateData → no auto-rollback; SYSTEM_ADMIN must coordinate manually". An
    // automatic rollback of a half-finished data move is how you lose the copy that was correct.
    expect(activities).toMatch(/export async function compensateCreateRdsActivity/);
    expect(activities).toMatch(/export async function compensateAssignDedicatedDbActivity/);
    expect(activities).not.toMatch(/export async function compensateMigrateDataActivity/);
  });

  it('compensates in reverse order', () => {
    const abort = workflow.slice(workflow.indexOf("state = 'ABORTING'"));
    expect(abort.indexOf('compensateAssignDedicatedDbActivity')).toBeLessThan(
      abort.indexOf('compensateCreateRdsActivity'),
    );
  });

  it('has a worker on the task queue the spec names', () => {
    expect(exists('backend/src/modules/tenant/workflows/enterprise-provisioning.worker.ts')).toBe(
      true,
    );
    expect(
      read('backend/src/modules/tenant/workflows/enterprise-provisioning.worker.ts'),
    ).toContain('enterprise-provisioning');
  });
});

// ── 6. The human gate ───────────────────────────────────────────────────────

describe('Phase 25 · the human gate never times out (master:5736, 5771)', () => {
  it('waits on a condition with NO timeout argument', () => {
    // "must NOT timeout — wait indefinitely for approve/abort signal". A timeout here would let an
    // unattended workflow proceed to migrate data nobody approved, or abandon a tenant mid-way.
    expect(workflow).toMatch(/await condition\(\(\) => approved \|\| aborted\);/);
    expect(workflow).not.toMatch(/condition\([^)]*,\s*['"]?\d/);
  });

  it('offers both signals', () => {
    expect(workflow).toMatch(/defineSignal<\[void\]>\('approve'\)/);
    expect(workflow).toMatch(/defineSignal<\[void\]>\('abort'\)/);
  });

  it('notifies SYSTEM_ADMIN before waiting', () => {
    expect(workflow.indexOf('notifyAwaitingApprovalActivity')).toBeLessThan(
      workflow.indexOf('await condition('),
    );
  });
});

// ── 7. Idempotency ──────────────────────────────────────────────────────────

describe('Phase 25 · re-triggering does not create a second RDS (master:5770)', () => {
  it('keys the workflow id on the tenant', () => {
    // Temporal refuses a second start for a workflow id that is already running or completed, so
    // the id IS the idempotency key. A random id would let two clicks buy two databases.
    expect(tenantService).toMatch(/`enterprise-provisioning-\$\{tenantId\}`/);
  });

  it('treats an already-started workflow as a conflict, not a crash', () => {
    expect(tenantService).toMatch(/WorkflowExecutionAlreadyStartedError/);
    expect(tenantService).toMatch(/ConflictException/);
  });

  it('refuses a tenant that already has a dedicated DB', () => {
    expect(tenantService).toMatch(/dedicated_db_url !== null/);
  });
});

// ── 8. Conditional data migration ───────────────────────────────────────────

describe('Phase 25 · data migration is conditional (master:5738)', () => {
  it('skips when the tenant has no existing data', () => {
    const migrate = activities.slice(
      activities.indexOf('export async function migrateDataActivity'),
    );
    expect(migrate).toMatch(/hasData/);
    expect(migrate).toMatch(/migrate_data\.skipped\.no_existing_data/);
  });

  it('is unreachable on the abort path', () => {
    // The other half of the condition — "AND signal = approve" — is structural: the workflow returns
    // inside the abort branch, so the activity below it cannot run.
    // Bounded by the two landmarks rather than by the first closing brace: that brace belongs to
    // the log.warn object literal, so slicing on it cut the branch off before the `return`.
    const from = workflow.indexOf('if (aborted)');
    const to = workflow.indexOf('acts.migrateDataActivity');
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    expect(workflow.slice(from, to)).toMatch(/\n\s*return;/);
  });
});

// ── 9. Typed contracts ──────────────────────────────────────────────────────

describe('Phase 25 · typed contracts (master:5764-5765)', () => {
  it.each(['platform.enterprise.contract_signed.v1', 'platform.enterprise.db_provisioned.v1'])(
    '%s has both an Avro schema and a TypeScript interface',
    (event) => {
      expect(exists(`packages/@cos/kafka/src/avro/${event}.avsc`)).toBe(true);
      expect(exists(`packages/@cos/shared/src/events/${event}.ts`)).toBe(true);
    },
  );

  it('both carry the tenant name and code §19.8 renders', () => {
    // Added 2026-08-25 during Phase 20: §19.8 pins the SYSTEM_ADMIN notification body to
    // "{tenant_name} ({tenant_code})" and the Notification Service renders templates from the event
    // payload alone, so the names have to travel on the event.
    for (const event of [
      'platform.enterprise.contract_signed.v1',
      'platform.enterprise.db_provisioned.v1',
    ]) {
      const schema = JSON.parse(read(`packages/@cos/kafka/src/avro/${event}.avsc`)) as {
        fields: Array<{ name: string; type: { fields?: Array<{ name: string }> } }>;
      };
      const payload = (schema.fields.find((f) => f.name === 'payload')?.type.fields ?? []).map(
        (f) => f.name,
      );
      expect(payload).toContain('tenant_name');
      expect(payload).toContain('tenant_code');
    }
  });

  it('carries the fields master:5747-5748 actually names, not only the ones §19.8 added later', () => {
    // The assertion above pins tenant_name and tenant_code — both added in Phase 20 for the
    // notification body. The two fields the PHASE COMMAND fixes were never asserted at all, so the
    // payload the spec defines was the only part of it nothing was watching. rds_endpoint is the
    // whole point of db_provisioned: without it a SYSTEM_ADMIN is told a database exists and not
    // where it is.
    const payloadOf = (event: string): string[] => {
      const schema = JSON.parse(read(`packages/@cos/kafka/src/avro/${event}.avsc`)) as {
        fields: Array<{ name: string; type: { fields?: Array<{ name: string }> } }>;
      };
      return (schema.fields.find((f) => f.name === 'payload')?.type.fields ?? []).map(
        (f) => f.name,
      );
    };
    expect(payloadOf('platform.enterprise.contract_signed.v1')).toEqual(
      expect.arrayContaining(['tenant_id', 'contract_reference']),
    );
    expect(payloadOf('platform.enterprise.db_provisioned.v1')).toEqual(
      expect.arrayContaining(['tenant_id', 'rds_endpoint']),
    );
    // And the producer populates rds_endpoint from the endpoint the activity read back off AWS,
    // rather than from the identifier it asked for — those differ, and only one is connectable.
    expect(activities).toMatch(/rds_endpoint:/);
  });

  it('the producers actually populate them', () => {
    // A schema field with an empty default is satisfied by a producer that sends nothing — the
    // notification would then read "provisioning started for  ()".
    expect(tenantService).toMatch(/tenant_name: tenant\.tenant_name/);
    expect(activities).toMatch(/tenant_name: identity\.tenant_name/);
  });
});

// ── The two mandates only the source can show ───────────────────────────────

describe('Phase 25 · the mandates a passing request cannot demonstrate (master:5734, 5761)', () => {
  const webhookService = read('backend/src/modules/platform-webhook/platform-webhook.service.ts');

  it('compares the signature in constant time, which no 401 test can prove', () => {
    // master:5761 — "Compare X-Webhook-Signature header vs expectedSig using timingSafeEqual
    // (constant-time)". The integration suite covers wrong, missing and replayed signatures, and
    // every one of those still answers 401 under a plain `===`. What `===` loses is the timing
    // property: it returns at the first differing byte, so an attacker measuring response times
    // recovers the expected signature one character at a time. That is invisible to any test that
    // only reads the status code, which is why it is asserted here against the source.
    expect(webhookService).toMatch(/timingSafeEqual\(/);
    // Length is compared FIRST and separately: timingSafeEqual throws on unequal lengths rather
    // than returning false, so a short signature would be a 500 instead of a 401 without this.
    expect(webhookService).toMatch(/\.length\s*!==\s*\w+\.length\s*\|\|\s*!timingSafeEqual\(/);
    // NEGATIVE — no direct string comparison of the two signatures anywhere in the module.
    const code = webhookService
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
      .join('\n');
    expect(code).not.toMatch(/signature\s*[=!]==\s*expected|expected\s*[=!]==\s*signature/);
  });

  it('runs `prisma migrate deploy`, not a schema push', () => {
    // master:5734 names the command for Activity 2. `prisma db push` reaches the same schema and
    // writes no _prisma_migrations rows, so the dedicated DB would come up looking migrated and
    // then diverge from the shared one on the next release — with nothing to tell you where it
    // started. The distinction never shows up in a passing provision, only months later.
    expect(activities).toMatch(/prisma migrate deploy/);
    expect(activities).not.toMatch(/prisma db push/);
  });
});

// ── 10. Terraform ───────────────────────────────────────────────────────────

describe('Phase 25 · Terraform module (master:5733, 5766)', () => {
  it('defaults to the instance class and storage the spec names', () => {
    const variables = read('infrastructure/terraform/modules/rds-tenant/variables.tf');
    expect(variables).toMatch(/default\s*=\s*"db\.t3\.medium"/);
    expect(variables).toMatch(/variable "allocated_storage"[\s\S]{0,120}default\s*=\s*100/);
  });

  it('uses GP3 storage and a per-tenant KMS key', () => {
    const main = read('infrastructure/terraform/modules/rds-tenant/main.tf');
    expect(main).toMatch(/storage_type\s*=\s*"gp3"/);
    expect(main).toMatch(/kms_key_id\s*=\s*var\.kms_key_arn/);
  });

  it('publishes outputs.tf, the third file master:5766 names, and every output resolves', () => {
    // main.tf and variables.tf were read above; outputs.tf was named by the spec and read by
    // nothing, so it could have been emptied without a single failure. A module that creates a
    // database and exports nothing hands the caller no way to reach it.
    const outputs = read('infrastructure/terraform/modules/rds-tenant/outputs.tf');
    const main = read('infrastructure/terraform/modules/rds-tenant/main.tf');

    const declared = [...outputs.matchAll(/output\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(declared).toEqual(expect.arrayContaining(['db_endpoint', 'db_port']));

    // Every output must point at a resource this module actually declares — an output referring to
    // a resource that was renamed away is a plan-time error nobody here would otherwise see.
    for (const [, resource] of outputs.matchAll(/value\s*=\s*(aws_[a-z0-9_]+\.[a-z0-9_]+)/g)) {
      const [type, name] = resource.split('.');
      expect(main).toMatch(new RegExp(`resource\\s+"${type}"\\s+"${name}"`));
    }
  });
});

// ── 11. Rule 26 ─────────────────────────────────────────────────────────────

describe('Phase 25 · declared dependencies (master:5750-5751; Rule 26)', () => {
  it('lists @aws-sdk/client-rds in the backend package.json', () => {
    // Rule 26 exists because an import without the dependency passes locally and fails in CI.
    expect(read('backend/package.json')).toMatch(/"@aws-sdk\/client-rds":/);
    expect(activities).toMatch(/@aws-sdk\/client-rds/);
  });
});

// ── 12. CRM-agnostic ────────────────────────────────────────────────────────

describe('Phase 25 · the webhook stays CRM-agnostic (master:5729, 5773)', () => {
  it('accepts only tenant_id and an optional contract_reference', () => {
    const dto = controller.slice(0, controller.indexOf('interface WebhookRequest'));
    const fields = [...dto.matchAll(/^\s{2}([a-z_]+)[!?]:/gm)].map((m) => m[1]);
    expect(fields.sort()).toEqual(['contract_reference', 'tenant_id']);
  });

  it('NEGATIVE — no CRM vendor SDK or vendor-shaped payload anywhere in the module', () => {
    // "no CRM-specific adapter in Phase 25". A Salesforce or HubSpot shape here would make the
    // webhook a per-vendor integration, which is the thing the generic payload exists to avoid.
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts')) files.push(full);
      }
    };
    walk(abs('backend/src/modules/platform-webhook'));
    const offenders = files.filter((f) =>
      /salesforce|hubspot|pipedrive|zoho|dynamics365/i.test(fs.readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

// ── 13. Platform tables stay put ────────────────────────────────────────────

describe('Phase 25 · platform tables never move (master:5772)', () => {
  it('resolves a tenant DB url by reading platform.tenants on the SHARED connection', () => {
    // If the platform schema followed a tenant onto its dedicated instance, the very lookup that
    // finds the dedicated URL would have to run on the instance it is trying to find — the system
    // could not answer a single request after provisioning.
    const getDbUrl = read('backend/src/shared/prisma/get-db-url.ts');
    expect(getDbUrl).toMatch(/createPrismaClient\(process\.env\['DATABASE_URL'\]\)/);
    expect(getDbUrl).toMatch(/FROM platform\.tenants/);
  });

  it('migrates domain data only, never the platform schema', () => {
    const migrate = activities.slice(
      activities.indexOf('export async function migrateDataActivity'),
    );
    expect(migrate).not.toMatch(/--schema[= ]platform\b/);
    expect(migrate).not.toMatch(/pg_dump[^|]*\bplatform\./);
  });
});

// ── 14. OpenAPI ─────────────────────────────────────────────────────────────

describe('Phase 25 · OpenAPI', () => {
  it('documents the webhook route', () => {
    const doc = readYaml<{ openapi: string; paths: Record<string, Record<string, unknown>> }>(
      'docs/api/platform-webhooks.openapi.yaml',
    );
    expect(doc.openapi).toMatch(/^3\.1/);
    expect(doc.paths['/platform/webhooks/enterprise-contract-signed']?.['post']).toBeDefined();
  });
});
