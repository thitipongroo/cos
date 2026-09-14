// Tenant Service — Phase 2
// Manages tenant lifecycle: creation, deactivation, schema provisioning.
// Uses platform PrismaClient directly (cross-tenant operations).
// Emits identity.tenant.* and platform.enterprise.* events through the Phase 8 OUTBOX
// (§35.13 ESC-13) — never published directly to Kafka.
//
// EVERY SYSTEM_ADMIN ACTION HERE IS AUDITED WITH A JUSTIFICATION (§6.7, product-owner decision
// 2026-09-14): create, deactivate, assign dedicated DB, mark contracted, approve and abort. Until that
// day none of them wrote platform.audit_logs, although §20.4 said "All actions are logged". The row is
// written INSIDE the action's transaction, so an action that cannot be audited does not happen — §6.7
// "No System Admin action is silent". An actor with no platform.users row fails the actor_id foreign
// key, and that failure is the action's failure too, on purpose.

import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { OutboxPublisher } from '@cos/kafka';
import { buildOutboxEvent } from '../../shared/outbox/outbox.types';
import { createLogger } from '@cos/logger';
import { Connection, Client, WorkflowNotFoundError } from '@temporalio/client';
import type { Prisma } from '@prisma/client';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { FeatureFlagService } from '../../shared/feature-flags/feature-flag.service';
import {
  decryptDedicatedDbUrl,
  encryptDedicatedDbUrl,
  ENCRYPTED_DB_URL_FLAG,
} from '../../shared/crypto/dedicated-db-url-cipher';
import { assertSafeTenantId } from '../../shared/prisma/assert-safe-tenant-id';
import {
  abortSignal,
  approveSignal,
  workflowStateQuery,
} from './workflows/enterprise-provisioning.workflow';

const logger = createLogger('tenant-service');

/**
 * Default IANA timezone for a data-residency region (Phase 20 §19.3/§19.6). Used to seed
 * `tenants.timezone` at provisioning; a tenant may override it afterwards (PO 2026-07-23).
 */
const REGION_TIMEZONE: Record<string, string> = {
  'ap-southeast-7': 'Asia/Bangkok',
  'ap-southeast-1': 'Asia/Singapore',
  'eu-west-1': 'Europe/Dublin',
};

export function defaultTimezoneForRegion(dataRegion: string): string {
  return REGION_TIMEZONE[dataRegion] ?? 'Asia/Bangkok';
}

/**
 * A tenant row as this service actually reads it — every column of platform.tenants EXCEPT
 * `dedicated_db_url`, which is a database connection string complete with credentials and must never
 * be serialized into a response or pulled into memory without a reason.
 *
 * Keys are snake_case because `$queryRaw` bypasses Prisma's field mapping and hands back RAW column
 * names. The generated `Tenant` model declares camelCase (`tenantId` @map("tenant_id")), so every
 * `$queryRaw<Tenant[]>` in this file described a shape that never existed at runtime — and reading
 * `tenant.tenantId` off one of those rows silently produced `undefined`. That is not hypothetical:
 * `identity.tenant.created.v1` was built from four such reads, and its Avro schema declares all four
 * payload fields as non-null strings, so every publish failed to encode and was swallowed by
 * publishEvent's catch. Tenant-created events have been dropped, not delivered.
 *
 * This type states what the query returns, so the compiler now rejects the camelCase reads.
 */
export interface TenantSummaryRow {
  tenant_id: string;
  tenant_code: string;
  tenant_name: string;
  keycloak_realm: string;
  plan_type: string;
  is_active: boolean;
  data_region: string;
  timezone: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * A tenant row as the SYSTEM_ADMIN list returns it: the summary plus the dedicated DB's HOSTNAME.
 *
 * §20.4.1 asks the list to show "URL hostname (dedicated, truncated)". The URL itself carries the
 * password and was taken off the wire for that reason (see listTenants), so the server decrypts it,
 * parses it and sends the host alone. `null` means the tenant is on the shared database.
 */
export interface TenantListRow extends TenantSummaryRow {
  dedicated_db_host: string | null;
}

/** One ENTERPRISE tenant's provisioning run, as §34.3's `workflowState` query reports it. */
export interface TenantProvisioningRow {
  tenant_id: string;
  /**
   * The §34.3 state, or `null` when the run EXISTS but did not answer within
   * PROVISIONING_QUERY_DEADLINE_MS — a query is answered by a worker, and with none polling the
   * `enterprise-provisioning` queue there is nobody to answer. `null` says "could not be read", never
   * a state the run is not in. A tenant with no run at all is absent from the list instead.
   */
  workflow_state: string | null;
}

/** The six audited SYSTEM_ADMIN actions (§6.7). The value is what `audit_logs.action` records. */
export type TenantAdminAction =
  | 'tenant.create'
  | 'tenant.deactivate'
  | 'tenant.assign_dedicated_db'
  | 'tenant.mark_contracted'
  | 'tenant.provisioning.approve'
  | 'tenant.provisioning.abort';

/** How long one provisioning-state query may take before the run is reported as unreadable. */
export const PROVISIONING_QUERY_DEADLINE_MS = 5_000;

/**
 * Interactive transactions that also call Temporal get more than Prisma's 5 s default: the audit row,
 * the workflow call and the outbox write commit together, and a Temporal round-trip is not bounded by
 * the database.
 */
const TEMPORAL_TX_TIMEOUT_MS = 15_000;

/** Hostname of a stored (possibly encrypted) dedicated-DB URL. Throws on an undecryptable value. */
export function dedicatedDbHost(stored: string): string {
  return new URL(decryptDedicatedDbUrl(stored)).hostname;
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class TenantService implements OnModuleDestroy {
  // Platform PrismaClient — NOT TenantPrismaService (this operates cross-tenant)
  private readonly prisma = createPrismaClient();

  // FeatureFlagService gates whether dedicated_db_url is encrypted on write (s1.tenant.encrypted-db-url,
  // security review F5b / QM-15). Injected rather than constructed so the Unleash client stays owned by
  // Nest and is closed on shutdown (Rule 39).
  constructor(private readonly flags: FeatureFlagService) {}

  /** Encrypt-on-write decision for this tenant, honouring the QM-15 rollout flag. */
  private encryptDbUrl(url: string, tenantId?: string): string {
    return encryptDedicatedDbUrl(url, this.flags.isEnabled(ENCRYPTED_DB_URL_FLAG, { tenantId }));
  }

  /** Close the Prisma connection on shutdown so the query-engine socket does not leak. */
  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /**
   * Write one audit row for a SYSTEM_ADMIN action, inside the caller's transaction.
   *
   * `tenant_id` is the TARGET tenant, not the admin's own — an auditor reading one tenant's trail must
   * find what was done TO it. RLS on audit_logs checks `tenant_id` against app.current_tenant_id (the
   * same WITH CHECK AuditInterceptor satisfies), so the GUC is set in this transaction first. The id is
   * UUID-validated before interpolation because a GUC cannot be a bound parameter (QM-4).
   *
   * `metadata` holds the justification and IDs only — never a URL, which may carry credentials.
   */
  private async writeAdminAudit(
    tx: Tx,
    entry: {
      tenantId: string;
      actorId: string;
      action: TenantAdminAction;
      justification: string;
      extra?: Record<string, string | null>;
    },
  ): Promise<void> {
    assertSafeTenantId(entry.tenantId);
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${entry.tenantId}'`);
    await tx.$executeRaw`
      INSERT INTO platform.audit_logs (tenant_id, actor_id, action, resource_type, resource_id, metadata)
      VALUES (
        ${entry.tenantId}::uuid,
        ${entry.actorId}::uuid,
        ${entry.action},
        'tenant',
        ${entry.tenantId}::uuid,
        ${JSON.stringify({ justification: entry.justification, ...entry.extra })}::jsonb
      )
    `;
  }

  /**
   * Run `fn` with a Temporal client and CLOSE its connection afterwards (Rule 39). getTemporalClient
   * below opens one per call and never closes it; the new provisioning reads are called on every list
   * load, so they must not inherit that leak.
   */
  private async withTemporal<T>(
    fn: (client: Client, connection: Connection) => Promise<T>,
  ): Promise<T> {
    const connection = await Connection.connect({
      address: process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233',
    });
    try {
      return await fn(new Client({ connection }), connection);
    } finally {
      await connection.close();
    }
  }

  async createTenant(
    // The justification travels as its own argument, so it cannot be mistaken for a tenant column.
    dto: Omit<CreateTenantDto, 'justification'>,
    createdBy: string,
    justification: string,
  ): Promise<TenantSummaryRow> {
    const existing = await this.prisma.$queryRaw<Array<{ tenant_id: string }>>`
      SELECT tenant_id FROM platform.tenants
      WHERE tenant_code = ${dto.tenantCode}
      LIMIT 1
    `;
    if (existing.length) {
      throw new ConflictException(`Tenant code '${dto.tenantCode}' already exists`);
    }

    if (
      dto.dedicatedDbUrl !== undefined &&
      !dto.dedicatedDbUrl.startsWith('postgresql://') &&
      !dto.dedicatedDbUrl.startsWith('postgres://')
    ) {
      throw new BadRequestException('dedicatedDbUrl must start with postgresql:// or postgres://');
    }

    // SMB/mid-market (STARTER, PROFESSIONAL) → shared realm per spec §5, §7.6 step 3
    // ENTERPRISE → per-tenant realm; provisioned by Phase 25 EnterpriseProvisioningWorkflow
    const keycloakRealm =
      dto.planType === 'ENTERPRISE' ? `cos-${dto.tenantCode}` : 'construction-os';

    // Create tenant record (ADR-008: shared DB + tenant_id, no per-tenant schema).
    //
    // The enum is SCHEMA-QUALIFIED: `PlanType` lives in `platform`, and an unqualified `::"PlanType"`
    // failed on a real database with `type "PlanType" does not exist` (42704) — on every create, since
    // the first commit. Unit tests mock Prisma and the provisioning integration spec stubs this
    // service, so nothing ran the SQL until the SYSTEM_ADMIN panel did on 2026-09-14.
    // test/provisioning/02-admin-audit.integration.spec.ts now creates a tenant for real.
    const tenant = await this.prisma.$transaction(async (tx) => {
      const [created] = await tx.$queryRaw<TenantSummaryRow[]>`
        INSERT INTO platform.tenants (tenant_code, tenant_name, keycloak_realm, plan_type, dedicated_db_url, data_region, timezone)
        VALUES (${dto.tenantCode}, ${dto.tenantName}, ${keycloakRealm}, ${dto.planType}::platform."PlanType", ${dto.dedicatedDbUrl ? this.encryptDbUrl(dto.dedicatedDbUrl) : null},${dto.dataRegion ?? 'ap-southeast-1'}, ${dto.timezone ?? defaultTimezoneForRegion(dto.dataRegion ?? 'ap-southeast-1')})
        RETURNING tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active,
                  data_region, timezone, created_at, updated_at
      `;

      // ESC-20: `$queryRaw` returns RAW DB column names — Prisma's `@map` (tenantId → tenant_id)
      // is applied to the query-builder API, NOT to raw SQL results. The `<Tenant[]>` generic is a
      // compile-time cast only, so `created.tenantId` is `undefined` at runtime. Read the row
      // through its real snake_case shape here.
      const row = created as unknown as {
        tenant_id: string;
        tenant_code: string;
        tenant_name: string;
        plan_type: string;
      };

      // Phase 8 Outbox Pattern (§35.13 ESC-13): the event joins the INSERT's transaction, built
      // from the inserted row so tenant_id is the real generated id. Replaces the previous
      // fire-and-forget publish, whose comment ("outbox pattern handles retries") was never true.
      await OutboxPublisher.write(
        tx,
        buildOutboxEvent({
          eventType: 'identity.tenant.created.v1',
          // The event is tenant-scoped (identity.* is not a platform.* type), so it routes to
          // {tenant_id}.identity.tenant.created.v1, which KafkaProducer creates on first use.
          // ESC-19: the previous envelope hardcoded tenant_id: 'platform', targeting a topic that
          // is never provisioned; with allowAutoTopicCreation:false that publish could not succeed.
          tenantId: row.tenant_id,
          actorId: createdBy,
          correlationId: randomUUID(),
          payload: {
            tenant_id: row.tenant_id,
            tenant_code: row.tenant_code,
            tenant_name: row.tenant_name,
            plan_type: row.plan_type,
          },
        }),
      );

      // Withholding-tax defaults, in the SAME transaction as the tenant row.
      //
      // §13.3 says the Thailand rates are "pre-seeded at tenant provisioning", and
      // 20260608000001_wht_rules_payment_ref repeats it in its own header — but nothing anywhere
      // did it. WhtService.calculate throws NotFoundException when no rule matches, so withholding
      // tax could not be computed for any tenant that had ever been created.
      //
      // Inside the transaction on purpose: a tenant that exists without its statutory defaults is
      // the state this is fixing, so it must not be reachable by a failure between two statements.
      // A tenant operating outside Thailand simply never looks up jurisdiction TH.
      await tx.$executeRaw`
        INSERT INTO finance.wht_rules (tenant_id, jurisdiction_code, service_type, rate, is_active)
        VALUES (${row.tenant_id}::uuid, 'TH', 'services', 3.00, true),
               (${row.tenant_id}::uuid, 'TH', 'rent',     5.00, true)
        ON CONFLICT ON CONSTRAINT wht_rules_unique DO NOTHING
      `;

      await this.writeAdminAudit(tx, {
        tenantId: row.tenant_id,
        actorId: createdBy,
        action: 'tenant.create',
        justification,
        extra: { tenant_code: row.tenant_code, plan_type: row.plan_type },
      });

      logger.info({ tenantCode: dto.tenantCode, createdBy }, 'Tenant record created');

      return created!;
    });

    // Kafka topics are NOT provisioned here. KafkaProducer creates each per-tenant topic on the
    // first event that needs it (§7.3), so a tenant costs topics in proportion to what it actually
    // uses. Provisioning the whole catalogue at signup created 46 topics — 138 partitions, 414
    // replicas at RF=3 — for every tenant regardless of usage, making broker capacity scale with
    // customer count rather than traffic. KafkaTopicProvisioner still exists for operator-driven
    // re-provisioning (e.g. rebuilding a cluster).

    logger.info(
      { tenantCode: dto.tenantCode, keycloakRealm },
      'Keycloak realm assigned to tenant record',
    );

    // identity.tenant.created.v1 is NOT published here: it was written to the outbox inside the
    // create transaction above, so a rollback emits nothing and a commit emits exactly once.

    return tenant;
  }

  async deactivateTenant(tenantId: string, actorId: string, justification: string): Promise<void> {
    // Outbox (§35.13 ESC-13): the UPDATE and its event share one transaction, so a tenant is never
    // deactivated without the event, and never emits the event without being deactivated.
    //
    // RETURNING one column, not `*`: the row is used only as an "did this update anything" check,
    // so there is no reason to pull dedicated_db_url (a credentialed connection string) into memory.
    await this.prisma.$transaction(async (tx) => {
      const [tenant] = await tx.$queryRaw<Array<{ tenant_id: string }>>`
        UPDATE platform.tenants
        SET is_active = false, updated_at = now()
        WHERE tenant_id = ${tenantId}::uuid AND is_active = true
        RETURNING tenant_id
      `;
      if (!tenant) {
        throw new NotFoundException(`Tenant ${tenantId} not found or already inactive`);
      }

      await OutboxPublisher.write(
        tx,
        buildOutboxEvent({
          eventType: 'identity.tenant.deactivated.v1',
          tenantId,
          actorId,
          correlationId: randomUUID(),
          payload: { tenant_id: tenantId },
        }),
      );

      await this.writeAdminAudit(tx, {
        tenantId,
        actorId,
        action: 'tenant.deactivate',
        justification,
      });

      logger.info({ tenantId, actorId }, 'Tenant deactivated');
    });
  }

  async findByCode(tenantCode: string): Promise<TenantSummaryRow | null> {
    const [tenant] = await this.prisma.$queryRaw<TenantSummaryRow[]>`
      SELECT tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active,
             data_region, timezone, created_at, updated_at
        FROM platform.tenants
       WHERE tenant_code = ${tenantCode} AND is_active = true
       LIMIT 1
    `;
    return tenant ?? null;
  }

  async assignDedicatedDb(
    tenantId: string,
    dedicatedDbUrl: string,
    actorId: string,
    justification: string,
  ): Promise<void> {
    if (!dedicatedDbUrl.startsWith('postgresql://') && !dedicatedDbUrl.startsWith('postgres://')) {
      throw new BadRequestException('dedicatedDbUrl must start with postgresql:// or postgres://');
    }
    // Outbox (§35.13 ESC-13) — UPDATE and event in one transaction.
    await this.prisma.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`
        UPDATE platform.tenants
        SET dedicated_db_url = ${this.encryptDbUrl(dedicatedDbUrl, tenantId)}, updated_at = now()
        WHERE tenant_id = ${tenantId}::uuid AND is_active = true
      `;
      if (affected === 0) {
        throw new NotFoundException(`Tenant ${tenantId} not found or inactive`);
      }

      await OutboxPublisher.write(
        tx,
        buildOutboxEvent({
          eventType: 'identity.tenant.dedicated_db_assigned.v1',
          tenantId,
          actorId,
          correlationId: randomUUID(),
          payload: { tenant_id: tenantId },
        }),
      );

      // The HOST goes in the audit row, never the URL: the URL carries the password.
      await this.writeAdminAudit(tx, {
        tenantId,
        actorId,
        action: 'tenant.assign_dedicated_db',
        justification,
        extra: { dedicated_db_host: new URL(dedicatedDbUrl).hostname },
      });

      logger.info({ tenantId, actorId }, 'Tenant dedicated DB assigned');
    });
  }

  async markAsEnterpriseContracted(
    tenantId: string,
    contractReference: string | undefined,
    actorId: string,
    /**
     * The SYSTEM_ADMIN's reason, audited per §6.7. `null` ONLY for the CRM webhook (Path B, §34.2):
     * no person acted there, so there is no SYSTEM_ADMIN action to audit and no one to give a reason —
     * `actorId` is the literal 'system', which the audit row's actor_id foreign key could not hold.
     */
    justification: string | null,
  ): Promise<{ workflowId: string }> {
    const [tenant] = await this.prisma.$queryRaw<
      Array<{
        plan_type: string;
        is_active: boolean;
        dedicated_db_url: string | null;
        tenant_name: string;
        tenant_code: string;
      }>
    >`
      SELECT plan_type, is_active, dedicated_db_url, tenant_name, tenant_code
      FROM platform.tenants
      WHERE tenant_id = ${tenantId}::uuid
      LIMIT 1
    `;
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);
    if (tenant.plan_type !== 'ENTERPRISE')
      throw new BadRequestException('Tenant must be ENTERPRISE plan');
    if (!tenant.is_active) throw new BadRequestException('Tenant must be active');
    if (tenant.dedicated_db_url !== null)
      throw new BadRequestException('Tenant already has a dedicated DB assigned');

    const workflowId = `enterprise-provisioning-${tenantId}`;

    // The audit row, the workflow start and the outbox event commit together (§6.7). The workflow is
    // started INSIDE the transaction, after the audit insert: a start that throws rolls the audit row
    // back, so nothing is recorded that did not happen. The remaining window — Temporal accepted the
    // start and the COMMIT then fails — cannot be closed from here; the workflow is idempotent on its
    // id (§34.7), so a retry after such a failure is answered 409, not a second RDS instance.
    //
    // tenant_name / tenant_code travel on the payload because §19.8 pins the notification body to
    // "Automated DB provisioning workflow started for {tenant_name} ({tenant_code})" — the Notification
    // Service renders templates from the event payload alone and has no tenant lookup of its own.
    // `platform.*` events route to the shared platform.events topic (§15.7).
    await this.prisma.$transaction(
      async (tx) => {
        if (justification !== null) {
          await this.writeAdminAudit(tx, {
            tenantId,
            actorId,
            action: 'tenant.mark_contracted',
            justification,
            extra: { contract_reference: contractReference ?? null, workflow_id: workflowId },
          });
        }

        const client = await this.getTemporalClient();
        try {
          await client.workflow.start('enterpriseProvisioningWorkflow', {
            taskQueue: 'enterprise-provisioning',
            workflowId,
            args: [{ tenantId, contractReference: contractReference ?? null, actorId }],
          });
        } catch (err: unknown) {
          if ((err as { name?: string }).name === 'WorkflowExecutionAlreadyStartedError') {
            throw new ConflictException(
              `Provisioning workflow already running or completed for tenant ${tenantId}`,
            );
          }
          throw err;
        }

        await OutboxPublisher.write(
          tx,
          buildOutboxEvent({
            eventType: 'platform.enterprise.contract_signed.v1',
            tenantId,
            actorId,
            correlationId: randomUUID(),
            payload: {
              tenant_id: tenantId,
              tenant_name: tenant.tenant_name,
              tenant_code: tenant.tenant_code,
              contract_reference: contractReference ?? null,
            },
          }),
        );
      },
      { timeout: TEMPORAL_TX_TIMEOUT_MS },
    );

    logger.info({ tenantId, workflowId, actorId }, 'Enterprise provisioning workflow started');

    return { workflowId };
  }

  async findById(tenantId: string): Promise<TenantSummaryRow | null> {
    const [tenant] = await this.prisma.$queryRaw<TenantSummaryRow[]>`
      SELECT tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active,
             data_region, timezone, created_at, updated_at
        FROM platform.tenants
       WHERE tenant_id = ${tenantId}::uuid
       LIMIT 1
    `;
    return tenant ?? null;
  }

  /**
   * The signed-in user's OWN tenant identity — name + code + plan — for the Tenant Admin settings
   * screen. Self-service (any authenticated role in the tenant); the tenant_id comes from the JWT, so
   * a caller can only ever read their own tenant. This is NOT the SYSTEM_ADMIN cross-tenant listing.
   */
  async getMyTenant(
    tenantId: string,
  ): Promise<{ tenant_name: string; tenant_code: string; plan_type: string }> {
    const [t] = await this.prisma.$queryRaw<
      Array<{ tenant_name: string; tenant_code: string; plan_type: string }>
    >`
      SELECT tenant_name, tenant_code, plan_type::text AS plan_type
      FROM platform.tenants
      WHERE tenant_id = ${tenantId}::uuid AND is_active = true
      LIMIT 1
    `;
    if (!t)
      throw new NotFoundException({
        error: { code: 'COS-TENANT-404', message: 'Tenant not found' },
      });
    return t;
  }

  private async getTemporalClient(): Promise<Client> {
    const connection = await Connection.connect({
      address: process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233',
    });
    return new Client({ connection });
  }

  /**
   * List all tenants for the SYSTEM_ADMIN panel (§20.4.1).
   *
   * `dedicated_db_url` is READ here but never RETURNED. It holds a full
   * `postgresql://user:password@host/db` string, so the previous `SELECT *` shipped live database
   * credentials in the response body of GET /api/v1/admin/tenants — into browser history, proxy logs
   * and client-side error reporting. Since 2026-09-14 the row carries `dedicated_db_host` instead, which
   * §20.4.1 asks for and which cannot be used to connect.
   *
   * A stored value that cannot be decrypted THROWS, as decryptDedicatedDbUrl does everywhere: a list
   * that quietly showed such a tenant as pooled would be telling the operator something false about
   * where that tenant's data lives.
   */
  async listTenants(): Promise<TenantListRow[]> {
    const rows = await this.prisma.$queryRaw<
      Array<TenantSummaryRow & { dedicated_db_url: string | null }>
    >`
      SELECT tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active,
             data_region, timezone, created_at, updated_at, dedicated_db_url
        FROM platform.tenants
       ORDER BY created_at DESC
    `;
    return rows.map(({ dedicated_db_url, ...row }) => ({
      ...row,
      dedicated_db_host: dedicated_db_url === null ? null : dedicatedDbHost(dedicated_db_url),
    }));
  }

  /**
   * The provisioning state of every ENTERPRISE tenant that has a run (§34.3), for the panel's
   * Provisioning column, its Migration Gates count and its gate banner.
   *
   * One query per ENTERPRISE tenant, each capped at PROVISIONING_QUERY_DEADLINE_MS so one run with no
   * worker behind it cannot stall the list. A tenant with no run (WorkflowNotFoundError) is left out.
   */
  async listProvisioning(): Promise<TenantProvisioningRow[]> {
    const tenants = await this.prisma.$queryRaw<Array<{ tenant_id: string }>>`
      SELECT tenant_id FROM platform.tenants
       WHERE plan_type = 'ENTERPRISE'
       ORDER BY created_at DESC
    `;
    if (tenants.length === 0) return [];

    return this.withTemporal(async (client, connection) => {
      const rows: TenantProvisioningRow[] = [];
      for (const { tenant_id } of tenants) {
        try {
          const state = await connection.withDeadline(
            Date.now() + PROVISIONING_QUERY_DEADLINE_MS,
            () =>
              client.workflow
                .getHandle(`enterprise-provisioning-${tenant_id}`)
                .query(workflowStateQuery),
          );
          rows.push({ tenant_id, workflow_state: state });
        } catch (err: unknown) {
          if (err instanceof WorkflowNotFoundError) continue;
          logger.warn(
            { tenantId: tenant_id, err: err instanceof Error ? err.message : String(err) },
            'tenant.provisioning.state_unreadable',
          );
          rows.push({ tenant_id, workflow_state: null });
        }
      }
      return rows;
    });
  }

  /**
   * Send the human-gate decision (§34.5) — `approve` continues to data migration, `abort` compensates.
   *
   * Refused unless the run is AT the gate: a signal sent earlier would be recorded by Temporal and
   * acted on the moment the run arrives, which is a decision taken before its facts existed. 404 when
   * there is no run, 409 when it is elsewhere, 503 when the state cannot be read to check.
   */
  async decideProvisioning(
    tenantId: string,
    decision: 'approve' | 'abort',
    actorId: string,
    justification: string,
  ): Promise<{ workflowId: string; decision: 'approve' | 'abort' }> {
    const workflowId = `enterprise-provisioning-${tenantId}`;
    return this.withTemporal(async (client, connection) => {
      const handle = client.workflow.getHandle(workflowId);
      let state: string;
      try {
        state = await connection.withDeadline(Date.now() + PROVISIONING_QUERY_DEADLINE_MS, () =>
          handle.query(workflowStateQuery),
        );
      } catch (err: unknown) {
        if (err instanceof WorkflowNotFoundError) {
          throw new NotFoundException(`No provisioning run for tenant ${tenantId}`);
        }
        throw new ServiceUnavailableException(
          'Provisioning state could not be read, so the gate decision was not sent',
        );
      }
      if (state !== 'AWAITING_APPROVAL') {
        throw new ConflictException(
          `Provisioning run is in ${state}, not AWAITING_APPROVAL — nothing to ${decision}`,
        );
      }

      // Audit row first, signal second, one transaction: a signal that throws rolls the row back.
      await this.prisma.$transaction(
        async (tx) => {
          await this.writeAdminAudit(tx, {
            tenantId,
            actorId,
            action:
              decision === 'approve' ? 'tenant.provisioning.approve' : 'tenant.provisioning.abort',
            justification,
            extra: { workflow_id: workflowId },
          });
          await handle.signal(decision === 'approve' ? approveSignal : abortSignal);
        },
        { timeout: TEMPORAL_TX_TIMEOUT_MS },
      );

      logger.info({ tenantId, workflowId, actorId, decision }, 'tenant.provisioning.decision_sent');
      return { workflowId, decision };
    });
  }
}
