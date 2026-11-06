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
import type { CreateTrialTenantDto } from './dto/create-trial-tenant.dto';
import { countActiveProjects } from '../project/public/active-projects';
import {
  PLAN_ERROR,
  PLAN_PROJECT_LIMIT,
  READ_ONLY_DAYS,
  TRIAL_DAYS,
  type SubscriptionStatus,
  type TrialPlan,
} from './public/plan-limits';
import { NO_TENANT_ADMIN, tenantAdminStates, type TenantAdminState } from './public/tenant-admins';
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

/** §7.10 trial events — platform-scope, so their envelope tenant is the 'platform' sentinel (tenant in the payload). */
export const TRIAL_STARTED_EVENT = 'platform.tenant.trial_started.v1';
export const CONVERTED_EVENT = 'platform.tenant.converted.v1';
export const PLATFORM_EVENT_TENANT = 'platform';

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
 * A tenant row with its commercial state (§7.10, ADR-109) — what creating a tenant and converting a trial return.
 * The summary is unchanged so every other reader keeps its shape.
 */
export interface TenantSubscriptionRow extends TenantSummaryRow {
  subscription_status: SubscriptionStatus;
  trial_started_at: Date | null;
  trial_ends_at: Date | null;
  trial_source: string | null;
  converted_at: Date | null;
}

/** Where a trial came from — the optional fields of CreateTrialTenantDto. */
interface TrialOrigin {
  source: string | null;
  requestRef: string | null;
}

/**
 * A tenant row as the SYSTEM_ADMIN list returns it: the summary plus the dedicated DB's HOSTNAME.
 *
 * §20.4.1 asks the list to show "URL hostname (dedicated, truncated)". The URL itself carries the
 * password and was taken off the wire for that reason (see listTenants), so the server decrypts it,
 * parses it and sends the host alone. `null` means the tenant is on the shared database.
 */
export interface TenantListRow extends TenantSummaryRow, TenantAdminState {
  dedicated_db_host: string | null;
  /** §7.10 commercial state — the list shows trials and lets a SYSTEM_ADMIN convert one. */
  subscription_status: SubscriptionStatus;
  trial_ends_at: Date | null;
  converted_at: Date | null;
}

/** `GET /tenant` — the caller's own tenant, with its commercial state (§7.10). */
export interface MyTenantRow {
  tenant_name: string;
  tenant_code: string;
  plan_type: string;
  subscription_status: SubscriptionStatus;
  trial_ends_at: Date | null;
  read_only_until: Date | null;
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

/** The audited SYSTEM_ADMIN actions (§6.7). The value is what `audit_logs.action` records. */
export type TenantAdminAction =
  | 'tenant.create'
  | 'tenant.create_trial'
  | 'tenant.convert'
  | 'tenant.deactivate'
  | 'tenant.assign_dedicated_db'
  | 'tenant.mark_contracted'
  | 'tenant.provisioning.approve'
  | 'tenant.provisioning.abort'
  | 'tenant.bootstrap_admin'
  | 'tenant.resend_admin_invite'
  | 'tenant.cancel_admin_invite'
  | 'tenant.admin_invite_not_sent';

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

/**
 * Write one audit row for a SYSTEM_ADMIN action, inside the caller's transaction.
 *
 * `tenant_id` is the TARGET tenant, not the admin's own — an auditor reading one tenant's trail must
 * find what was done TO it. RLS on audit_logs checks `tenant_id` against app.current_tenant_id (the
 * same WITH CHECK AuditInterceptor satisfies), so the GUC is set in this transaction first. The id is
 * UUID-validated before interpolation because a GUC cannot be a bound parameter (QM-4).
 *
 * `metadata` holds the justification and IDs only — never a URL, which may carry credentials.
 *
 * Exported for TenantAdminBootstrapService, whose audit row joins UserService's insert transaction.
 */
export async function writeTenantAdminAudit(
  tx: Pick<Tx, '$executeRaw' | '$executeRawUnsafe'>,
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

  /** See writeTenantAdminAudit. */
  private async writeAdminAudit(
    tx: Tx,
    entry: Parameters<typeof writeTenantAdminAudit>[1],
  ): Promise<void> {
    await writeTenantAdminAudit(tx, entry);
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
  ): Promise<TenantSubscriptionRow> {
    return this.insertTenant(dto, createdBy, justification, null);
  }

  /**
   * Open a free trial (§7.10): a tenant on a trial plan whose status is TRIAL for TRIAL_DAYS from now.
   * Everything else — realm, WHT defaults, identity.tenant.created.v1, the audit row — is a normal create.
   * ENTERPRISE cannot be trialled; the DTO refuses it and so does this signature.
   */
  async createTrialTenant(
    dto: Omit<CreateTrialTenantDto, 'justification'>,
    createdBy: string,
    justification: string,
  ): Promise<TenantSubscriptionRow> {
    const { trialSource, trialRequestRef, ...tenant } = dto;
    return this.insertTenant(tenant, createdBy, justification, {
      source: trialSource ?? null,
      requestRef: trialRequestRef ?? null,
    });
  }

  private async insertTenant(
    dto: Omit<CreateTenantDto, 'justification'>,
    createdBy: string,
    justification: string,
    trial: TrialOrigin | null,
  ): Promise<TenantSubscriptionRow> {
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

    // SMB/mid-market (LITE, STARTER, PROFESSIONAL) → shared realm per spec §5, §7.6 step 3
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
    //
    // A trial's dates come from the database clock, so trial_ends_at is exactly TRIAL_DAYS after
    // trial_started_at and the daily job compares against the same clock (§7.10).
    const isTrial = trial !== null;
    const tenant = await this.prisma.$transaction(async (tx) => {
      const [created] = await tx.$queryRaw<TenantSubscriptionRow[]>`
        INSERT INTO platform.tenants (tenant_code, tenant_name, keycloak_realm, plan_type, dedicated_db_url, data_region, timezone,
                                      subscription_status, trial_started_at, trial_ends_at, trial_source, trial_request_ref)
        VALUES (${dto.tenantCode}, ${dto.tenantName}, ${keycloakRealm}, ${dto.planType}::platform."PlanType", ${dto.dedicatedDbUrl ? this.encryptDbUrl(dto.dedicatedDbUrl) : null},${dto.dataRegion ?? 'ap-southeast-1'}, ${dto.timezone ?? defaultTimezoneForRegion(dto.dataRegion ?? 'ap-southeast-1')},
                ${isTrial ? 'TRIAL' : 'ACTIVE'},
                CASE WHEN ${isTrial}::boolean THEN now() END,
                CASE WHEN ${isTrial}::boolean THEN now() + make_interval(days => ${TRIAL_DAYS}::int) END,
                ${trial?.source ?? null}, ${trial?.requestRef ?? null})
        RETURNING tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active,
                  data_region, timezone, created_at, updated_at,
                  subscription_status, trial_started_at, trial_ends_at, trial_source, converted_at
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

      // §7.10: the trial's own event, beside identity.tenant.created.v1 and in the same transaction.
      if (isTrial) {
        await OutboxPublisher.write(
          tx,
          buildOutboxEvent({
            eventType: TRIAL_STARTED_EVENT,
            tenantId: PLATFORM_EVENT_TENANT,
            actorId: createdBy,
            correlationId: randomUUID(),
            payload: {
              tenant_id: created!.tenant_id,
              tenant_code: created!.tenant_code,
              plan_type: created!.plan_type,
              trial_started_at: created!.trial_started_at!.toISOString(),
              trial_ends_at: created!.trial_ends_at!.toISOString(),
              trial_source: created!.trial_source,
            },
          }),
        );
      }

      await this.writeAdminAudit(tx, {
        tenantId: row.tenant_id,
        actorId: createdBy,
        action: isTrial ? 'tenant.create_trial' : 'tenant.create',
        justification,
        extra: isTrial
          ? {
              tenant_code: row.tenant_code,
              plan_type: row.plan_type,
              trial_source: trial.source,
              trial_request_ref: trial.requestRef,
            }
          : { tenant_code: row.tenant_code, plan_type: row.plan_type },
      });

      logger.info({ tenantCode: dto.tenantCode, createdBy, isTrial }, 'Tenant record created');

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

  /**
   * A trial customer paid (§7.10): TRIAL / EXPIRED / PENDING_DELETION → ACTIVE on the plan they bought.
   *
   * The tenant row is locked first, so the status read, the project count and the update see one state and two
   * operators converting at once cannot both succeed. The plan-change rule of §26.1 applies: a plan whose limit is
   * below the tenant's active projects is refused (COS-PLAN-002) — projects are never closed for the customer.
   * A tenant that is already ACTIVE is refused (COS-PLAN-004); a paying tenant changes plan by another path.
   *
   * platform.tenant.converted.v1 is written to the outbox in the same transaction (§7.10).
   */
  async convertTenant(
    tenantId: string,
    planType: TrialPlan,
    actorId: string,
    justification: string,
  ): Promise<TenantSubscriptionRow> {
    assertSafeTenantId(tenantId);
    return this.prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<
        Array<{ subscription_status: SubscriptionStatus; plan_type: string }>
      >`
        SELECT subscription_status, plan_type
          FROM platform.tenants
         WHERE tenant_id = ${tenantId}::uuid
           FOR UPDATE
      `;
      if (!current) throw new NotFoundException(`Tenant ${tenantId} not found`);
      if (current.subscription_status === 'ACTIVE') {
        throw new ConflictException({
          error: {
            code: PLAN_ERROR.NOT_CONVERTIBLE,
            message: 'The tenant is not in a trial state that can be converted.',
            messageKey: 'admin.tenant.error.notConvertible',
            details: { subscription_status: current.subscription_status },
          },
        });
      }

      // The project tables are tenant-scoped under RLS; the count runs as the target tenant.
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      const activeProjects = await countActiveProjects(tx, tenantId);
      const limit = PLAN_PROJECT_LIMIT[planType];
      if (limit !== null && activeProjects > limit) {
        throw new ConflictException({
          error: {
            code: PLAN_ERROR.PLAN_BELOW_USAGE,
            message: 'The tenant has more active projects than the target plan allows.',
            messageKey: 'admin.tenant.error.planBelowUsage',
            details: { target_plan: planType, limit, active_projects: activeProjects },
          },
        });
      }

      const [converted] = await tx.$queryRaw<TenantSubscriptionRow[]>`
        UPDATE platform.tenants
           SET plan_type = ${planType}::platform."PlanType",
               subscription_status = 'ACTIVE',
               converted_at = now(),
               updated_at = now()
         WHERE tenant_id = ${tenantId}::uuid
        RETURNING tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active,
                  data_region, timezone, created_at, updated_at,
                  subscription_status, trial_started_at, trial_ends_at, trial_source, converted_at
      `;

      await OutboxPublisher.write(
        tx,
        buildOutboxEvent({
          eventType: CONVERTED_EVENT,
          tenantId: PLATFORM_EVENT_TENANT,
          actorId,
          correlationId: randomUUID(),
          payload: {
            tenant_id: converted!.tenant_id,
            tenant_code: converted!.tenant_code,
            from_status: current.subscription_status,
            from_plan: current.plan_type,
            plan_type: planType,
            converted_at: converted!.converted_at!.toISOString(),
          },
        }),
      );

      await this.writeAdminAudit(tx, {
        tenantId,
        actorId,
        action: 'tenant.convert',
        justification,
        extra: {
          from_status: current.subscription_status,
          from_plan: current.plan_type,
          plan_type: planType,
        },
      });

      logger.info({ tenantId, actorId, planType }, 'Trial tenant converted');
      return converted!;
    });
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
  /**
   * The caller's own tenant. Since ADR-109 it also carries the commercial state, so the web and mobile shells can
   * say a trial is running out or has ended (read-only) before a write is refused with COS-PLAN-003.
   * `read_only_until` is trial_ends_at + 30 days — when a read-only trial becomes due for deletion (§7.10).
   */
  async getMyTenant(tenantId: string): Promise<MyTenantRow> {
    const [t] = await this.prisma.$queryRaw<MyTenantRow[]>`
      SELECT tenant_name, tenant_code, plan_type::text AS plan_type, subscription_status,
             trial_ends_at,
             trial_ends_at + make_interval(days => ${READ_ONLY_DAYS}::int) AS read_only_until
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
      Array<
        Omit<TenantListRow, 'dedicated_db_host' | keyof TenantAdminState> & {
          dedicated_db_url: string | null;
        }
      >
    >`
      SELECT tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active,
             data_region, timezone, created_at, updated_at, dedicated_db_url,
             subscription_status, trial_ends_at, converted_at
        FROM platform.tenants
       ORDER BY created_at DESC
    `;
    // ADR-110: whether each tenant has an administrator yet — the panel offers "Create tenant admin" at 0.
    const admins = await tenantAdminStates(this.prisma);
    return rows.map(({ dedicated_db_url, ...row }) => ({
      ...row,
      ...(admins.get(row.tenant_id) ?? NO_TENANT_ADMIN),
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
