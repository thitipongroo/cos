// Tenant Service — Phase 2
// Manages tenant lifecycle: creation, deactivation, schema provisioning.
// Uses platform PrismaClient directly (cross-tenant operations).
// Emits identity.tenant.created.v1 and identity.tenant.deactivated.v1 Kafka events.

import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  OnModuleDestroy,
} from '@nestjs/common';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { EventOutboxService } from '../../shared/events/event-outbox.service';
import { createLogger } from '@cos/logger';
import { Connection, Client } from '@temporalio/client';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { FeatureFlagService } from '../../shared/feature-flags/feature-flag.service';
import { encryptDedicatedDbUrl, ENCRYPTED_DB_URL_FLAG } from './utils/dedicated-db-url-cipher';

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

@Injectable()
export class TenantService implements OnModuleDestroy {
  // Platform PrismaClient — NOT TenantPrismaService (this operates cross-tenant)
  private readonly prisma = createPrismaClient();

  // FeatureFlagService gates whether dedicated_db_url is encrypted on write (s1.tenant.encrypted-db-url,
  // security review F5b / QM-15). Injected rather than constructed so the Unleash client stays owned by
  // Nest and is closed on shutdown (Rule 39).
  constructor(
    private readonly flags: FeatureFlagService,
    private readonly outbox: EventOutboxService,
  ) {}

  /** Encrypt-on-write decision for this tenant, honouring the QM-15 rollout flag. */
  private encryptDbUrl(url: string, tenantId?: string): string {
    return encryptDedicatedDbUrl(url, this.flags.isEnabled(ENCRYPTED_DB_URL_FLAG, { tenantId }));
  }

  /** Close the Prisma connection on shutdown so the query-engine socket does not leak. */
  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async createTenant(dto: CreateTenantDto, createdBy: string): Promise<TenantSummaryRow> {
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

    // Create tenant record (ADR-008: shared DB + tenant_id, no per-tenant schema)
    const tenant = await this.prisma.$transaction(async (tx) => {
      const [created] = await tx.$queryRaw<TenantSummaryRow[]>`
        INSERT INTO platform.tenants (tenant_code, tenant_name, keycloak_realm, plan_type, dedicated_db_url, data_region, timezone)
        VALUES (${dto.tenantCode}, ${dto.tenantName}, ${keycloakRealm}, ${dto.planType}::"PlanType", ${dto.dedicatedDbUrl ? this.encryptDbUrl(dto.dedicatedDbUrl) : null},${dto.dataRegion ?? 'ap-southeast-1'}, ${dto.timezone ?? defaultTimezoneForRegion(dto.dataRegion ?? 'ap-southeast-1')})
        RETURNING tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active,
                  data_region, timezone, created_at, updated_at
      `;

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

    // 4. Emit identity.tenant.created.v1 (non-fatal — outbox pattern handles retries).
    // Field names are the raw column names: `$queryRaw` does not apply Prisma's @map, so the
    // camelCase reads this used to make (tenant.tenantId, …) were all undefined and the Avro encode
    // rejected them — see TenantSummaryRow.
    await this.publishEvent('identity.tenant.created.v1', {
      tenant_id: tenant.tenant_id,
      tenant_code: tenant.tenant_code,
      tenant_name: tenant.tenant_name,
      plan_type: tenant.plan_type,
    });

    return tenant;
  }

  async deactivateTenant(tenantId: string, actorId: string): Promise<void> {
    // RETURNING one column, not `*`: the row is used only as an "did this update anything" check,
    // so there is no reason to pull dedicated_db_url (a credentialed connection string) into memory.
    const [tenant] = await this.prisma.$queryRaw<Array<{ tenant_id: string }>>`
      UPDATE platform.tenants
      SET is_active = false, updated_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND is_active = true
      RETURNING tenant_id
    `;
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found or already inactive`);
    }
    logger.info({ tenantId, actorId }, 'Tenant deactivated');

    await this.publishEvent('identity.tenant.deactivated.v1', { tenant_id: tenantId });
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
  ): Promise<void> {
    if (!dedicatedDbUrl.startsWith('postgresql://') && !dedicatedDbUrl.startsWith('postgres://')) {
      throw new BadRequestException('dedicatedDbUrl must start with postgresql:// or postgres://');
    }
    const affected = await this.prisma.$executeRaw`
      UPDATE platform.tenants
      SET dedicated_db_url = ${this.encryptDbUrl(dedicatedDbUrl, tenantId)}, updated_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND is_active = true
    `;
    if (affected === 0) {
      throw new NotFoundException(`Tenant ${tenantId} not found or inactive`);
    }
    logger.info({ tenantId, actorId }, 'Tenant dedicated DB assigned');
    await this.publishEvent('identity.tenant.dedicated_db_assigned.v1', { tenant_id: tenantId });
  }

  async markAsEnterpriseContracted(
    tenantId: string,
    contractReference: string | undefined,
    actorId: string,
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

    logger.info({ tenantId, workflowId, actorId }, 'Enterprise provisioning workflow started');
    // tenant_name / tenant_code travel on the payload because §19.8 pins the notification body to
    // "Automated DB provisioning workflow started for {tenant_name} ({tenant_code})" — the Notification
    // Service renders templates from the event payload alone and has no tenant lookup of its own.
    await this.publishEvent('platform.enterprise.contract_signed.v1', {
      tenant_id: tenantId,
      tenant_name: tenant.tenant_name,
      tenant_code: tenant.tenant_code,
      contract_reference: contractReference ?? null,
    });

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
   * Columns are listed explicitly to EXCLUDE `dedicated_db_url`. It holds a full
   * `postgresql://user:password@host/db` string (it is handed straight to createPrismaClient), so the
   * previous `SELECT *` shipped live database credentials in the response body of
   * GET /api/v1/admin/tenants — into browser history, proxy logs and client-side error reporting.
   * SYSTEM_ADMIN-gating is the wrong control for a secret that has no reason to leave the server at
   * all; getDbUrlForTenant() reads the column server-side when it is actually needed.
   */
  async listTenants(): Promise<TenantSummaryRow[]> {
    return this.prisma.$queryRaw<TenantSummaryRow[]>`
      SELECT tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active,
             data_region, timezone, created_at, updated_at
        FROM platform.tenants
       ORDER BY created_at DESC
    `;
  }

  /** Queue a platform-scope event. Durable and off the request path — see EventOutboxService. */
  private async publishEvent<T>(eventType: string, payload: T): Promise<void> {
    await this.outbox.publish<T>({
      event_type: eventType,
      event_version: '1.0',
      tenant_id: 'platform',
      actor_id: 'system',
      occurred_at: new Date().toISOString(),
      correlation_id: globalThis.crypto.randomUUID(),
      payload,
    });
  }
}
