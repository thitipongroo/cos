/**
 * Phase 25 — Enterprise Provisioning. CONFORMANCE only.
 *
 * The webhook's status codes (401 for an untrusted caller, 500 for a misconfigured server), the
 * @Roles gate on the admin path, and the platform-tables-stay-put rule are all asserted over real
 * HTTP by backend/test/spec-derived/phase-25-provisioning/01-provisioning-entry.integration — they
 * were removed from here on 2026-08-25 rather than kept as source-text scans.
 *
 * What is left cannot be reached by running the workflow: this phase creates infrastructure and
 * moves a tenant's data onto it, and the guarantees that matter are things that must NOT happen —
 * a gate that times out and migrates data nobody approved, a second RDS bought by a second click,
 * an automatic rollback of a half-finished data move, a CRM vendor's shape leaking into a payload
 * that exists to be vendor-neutral. A test cannot prove absence by passing; it has to look.
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

// ── Absence: the human gate ─────────────────────────────────────────────────

describe('the human gate never times out (master:5672, 5707)', () => {
  it('waits on a condition with NO timeout argument', () => {
    // "must NOT timeout — wait indefinitely for approve/abort signal". A timeout would let an
    // unattended workflow migrate data nobody approved, or abandon a tenant half-provisioned. The
    // only way to see it is to look for the absence of a second argument: a workflow with a 30-day
    // timeout behaves identically to a correct one for 30 days.
    expect(workflow).toMatch(/await condition\(\(\) => approved \|\| aborted\);/);
    expect(workflow).not.toMatch(/condition\([^)]*,\s*['"]?\d/);
  });

  it('notifies SYSTEM_ADMIN before it starts waiting', () => {
    // Ordering, not presence: notifying after the wait means nobody is told to approve, and the
    // workflow blocks forever with no one aware it is blocked.
    expect(workflow.indexOf('notifyAwaitingApprovalActivity')).toBeLessThan(
      workflow.indexOf('await condition('),
    );
  });
});

// ── Absence: compensation is deliberately incomplete ────────────────────────

describe('the saga does NOT roll back a data move (master:5680)', () => {
  it('compensates createRds and assignDedicatedDb, and nothing for migrateData', () => {
    // "migrateData → no auto-rollback; SYSTEM_ADMIN must coordinate manually". An automatic
    // rollback of a half-finished move is how you lose the copy that was correct. The missing
    // compensator IS the requirement, so only an absence check states it.
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

  it('cannot reach the data migration on the abort path', () => {
    // The other half of master:5674's condition — "AND signal = approve" — is structural: the
    // workflow returns inside the abort branch, so the activity below it is unreachable. Bounded by
    // the two landmarks rather than by the first closing brace, which belongs to a log object.
    const from = workflow.indexOf('if (aborted)');
    const to = workflow.indexOf('acts.migrateDataActivity');
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    expect(workflow.slice(from, to)).toMatch(/\n\s*return;/);
  });
});

// ── Absence: one trigger, one database ──────────────────────────────────────

describe('re-triggering does not buy a second RDS (master:5706)', () => {
  it('keys the workflow id on the tenant', () => {
    // Temporal refuses a second start for an id that is already running or completed, so the id IS
    // the idempotency key. A random id would let two clicks provision two databases, and nothing
    // would fail — you would find out on the invoice.
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

// ── Absence: the platform schema never travels ──────────────────────────────

describe('platform tables never move (master:5708)', () => {
  it('the data migration names no platform schema', () => {
    // The integration suite proves a tenant still RESOLVES after its dedicated_db_url points
    // nowhere. This is the other half: that a migration could not have copied the platform schema
    // across in the first place. Only absence states it — a pg_dump that included it would look
    // like a working migration right up until the first request after cutover.
    const migrate = activities.slice(
      activities.indexOf('export async function migrateDataActivity'),
    );
    expect(migrate).not.toMatch(/--schema[= ]platform\b/);
    expect(migrate).not.toMatch(/pg_dump[^|]*\bplatform\./);
  });

  it('resolves a tenant DB url on the SHARED connection', () => {
    // If the platform schema followed a tenant onto its own instance, the lookup that FINDS the
    // dedicated URL would have to run on the instance it is trying to find.
    const getDbUrl = read('backend/src/modules/tenant/utils/get-db-url.ts');
    expect(getDbUrl).toMatch(/createPrismaClient\(process\.env\['DATABASE_URL'\]\)/);
    expect(getDbUrl).toMatch(/FROM platform\.tenants/);
  });
});

// ── Absence: the webhook stays CRM-agnostic ─────────────────────────────────

describe('no CRM vendor leaks into the webhook (master:5665, 5709)', () => {
  it('accepts only tenant_id and an optional contract_reference', () => {
    const dto = controller.slice(0, controller.indexOf('interface WebhookRequest'));
    const fields = [...dto.matchAll(/^\s{2}([a-z_]+)[!?]:/gm)].map((m) => m[1]);
    expect(fields.sort()).toEqual(['contract_reference', 'tenant_id']);
  });

  it('has no vendor SDK or vendor-shaped payload anywhere in the module', () => {
    // "no CRM-specific adapter in Phase 25". A Salesforce or HubSpot shape here turns a generic
    // webhook into a per-vendor integration — which is exactly what the neutral payload avoids.
    // Swept across the whole module, because the point is that it appears NOWHERE.
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

// ── Cross-source: the event, its schema and its producer ────────────────────

describe('the enterprise events agree across every artifact (master:5700-5701)', () => {
  const events = [
    'platform.enterprise.contract_signed.v1',
    'platform.enterprise.db_provisioned.v1',
  ];

  it.each(events)('%s has both an Avro schema and a TypeScript interface', (event) => {
    expect(exists(`packages/@cos/shared/src/avro/${event}.avsc`)).toBe(true);
    expect(exists(`packages/@cos/shared/src/events/${event}.ts`)).toBe(true);
  });

  it('both schemas carry the tenant name and code §19.8 renders', () => {
    // The Notification Service renders its template from the event payload alone, so the names have
    // to travel ON the event. The schema and the template are two files nothing loads together.
    for (const event of events) {
      const schema = JSON.parse(read(`packages/@cos/shared/src/avro/${event}.avsc`)) as {
        fields: Array<{ name: string; type: { fields?: Array<{ name: string }> } }>;
      };
      const payload = (schema.fields.find((f) => f.name === 'payload')?.type.fields ?? []).map(
        (f) => f.name,
      );
      expect(payload).toContain('tenant_name');
      expect(payload).toContain('tenant_code');
    }
  });

  it('the producers actually populate them', () => {
    // A schema field with a default is satisfied by a producer that sends nothing — the
    // notification would then read "provisioning started for  ()" and encode perfectly well.
    expect(tenantService).toMatch(/tenant_name: tenant\.tenant_name/);
    expect(activities).toMatch(/tenant_name: identity\.tenant_name/);
  });
});

// ── Cross-source: the contract document versus the route ────────────────────

describe('the OpenAPI document describes the webhook that exists', () => {
  it('documents the route the controller serves', () => {
    const doc = readYaml<{ openapi: string; paths: Record<string, Record<string, unknown>> }>(
      'docs/api/platform-webhooks.openapi.yaml',
    );
    expect(doc.openapi).toMatch(/^3\.1/);
    expect(doc.paths['/platform/webhooks/enterprise-contract-signed']?.['post']).toBeDefined();
    expect(controller).toMatch(/enterprise-contract-signed/);
  });
});

// ── Cross-source: Rule 26 — an import needs its dependency ──────────────────

describe('declared dependencies (master:5686-5687; Rule 26)', () => {
  it('lists @aws-sdk/client-rds where the code imports it', () => {
    // The package.json and the import are two files that only meet at install time. An import
    // without the dependency passes locally, where a hoisted copy exists, and fails in CI.
    expect(activities).toMatch(/@aws-sdk\/client-rds/);
    expect(read('backend/package.json')).toMatch(/"@aws-sdk\/client-rds":/);
  });
});
