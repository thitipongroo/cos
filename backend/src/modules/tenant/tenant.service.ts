// Tenant Service — Phase 2
// Manages tenant lifecycle: creation, deactivation, schema provisioning.
// Uses platform PrismaClient directly (cross-tenant operations).
// Emits identity.tenant.* and platform.enterprise.* events through the Phase 8 OUTBOX
// (§35.13 ESC-13) — never published directly to Kafka.

import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Tenant } from '@prisma/client';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { KafkaTopicProvisioner, OutboxPublisher } from '@cos/kafka';
import { buildOutboxEvent } from '../../shared/outbox/outbox.types';
import { createLogger } from '@cos/logger';
import { Connection, Client } from '@temporalio/client';
import { CreateTenantDto } from './dto/create-tenant.dto';

const logger = createLogger('tenant-service');

@Injectable()
export class TenantService implements OnModuleDestroy {
  // Platform PrismaClient — NOT TenantPrismaService (this operates cross-tenant)
  private readonly prisma = createPrismaClient();

  /** Close the Prisma connection on shutdown so the query-engine socket does not leak. */
  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async createTenant(dto: CreateTenantDto, createdBy: string): Promise<Tenant> {
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
      const [created] = await tx.$queryRaw<Tenant[]>`
        INSERT INTO platform.tenants (tenant_code, tenant_name, keycloak_realm, plan_type, dedicated_db_url)
        VALUES (${dto.tenantCode}, ${dto.tenantName}, ${keycloakRealm}, ${dto.planType}::"PlanType", ${dto.dedicatedDbUrl ?? null})
        RETURNING *
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
          // {tenant_id}.identity.tenant.created.v1 — the topic provisionTenantTopics creates below.
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

      logger.info({ tenantCode: dto.tenantCode, createdBy }, 'Tenant record created');

      return created!;
    });

    // Provision the tenant's per-tenant Kafka topic set (spec §7.3) before any of the
    // tenant's events are produced. Idempotent; non-fatal so onboarding is not blocked
    // by a transient Kafka outage (topics can be re-provisioned by re-running onboarding).
    // ESC-20: read tenant_id, not tenantId — `tenant` is a raw `$queryRaw` row (snake_case
    // columns), so the previous `tenant.tenantId` provisioned topics for `undefined`.
    await this.provisionTenantTopics((tenant as unknown as { tenant_id: string }).tenant_id);

    logger.info(
      { tenantCode: dto.tenantCode, keycloakRealm },
      'Keycloak realm assigned to tenant record',
    );

    // identity.tenant.created.v1 was already written to the outbox inside the transaction above.

    return tenant;
  }

  async deactivateTenant(tenantId: string, actorId: string): Promise<void> {
    // Outbox (§35.13 ESC-13): the UPDATE and its event share one transaction, so a tenant is never
    // deactivated without the event, and never emits the event without being deactivated.
    await this.prisma.$transaction(async (tx) => {
      const [tenant] = await tx.$queryRaw<Tenant[]>`
        UPDATE platform.tenants
        SET is_active = false, updated_at = now()
        WHERE tenant_id = ${tenantId}::uuid AND is_active = true
        RETURNING *
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

      logger.info({ tenantId, actorId }, 'Tenant deactivated');
    });
  }

  async findByCode(tenantCode: string): Promise<Tenant | null> {
    const [tenant] = await this.prisma.$queryRaw<Tenant[]>`
      SELECT * FROM platform.tenants
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
    // Outbox (§35.13 ESC-13) — UPDATE and event in one transaction.
    await this.prisma.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`
        UPDATE platform.tenants
        SET dedicated_db_url = ${dedicatedDbUrl}, updated_at = now()
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

      logger.info({ tenantId, actorId }, 'Tenant dedicated DB assigned');
    });
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
      }>
    >`
      SELECT plan_type, is_active, dedicated_db_url
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

    // Outbox (§35.13 ESC-13). NOTE: this method performs no business DB write — the state change
    // lives in Temporal — so there is no row to be atomic *with*. The outbox is used here purely as
    // the durable at-least-once relay: the previous direct publish silently LOST the event whenever
    // Kafka was unavailable. `platform.*` events route to the shared platform.events topic (§15.7).
    await this.prisma.$transaction(async (tx) => {
      await OutboxPublisher.write(
        tx,
        buildOutboxEvent({
          eventType: 'platform.enterprise.contract_signed.v1',
          tenantId,
          actorId,
          correlationId: randomUUID(),
          payload: {
            tenant_id: tenantId,
            contract_reference: contractReference ?? null,
          },
        }),
      );
    });

    return { workflowId };
  }

  async findById(tenantId: string): Promise<Tenant | null> {
    const [tenant] = await this.prisma.$queryRaw<Tenant[]>`
      SELECT * FROM platform.tenants
      WHERE tenant_id = ${tenantId}::uuid
      LIMIT 1
    `;
    return tenant ?? null;
  }

  private async getTemporalClient(): Promise<Client> {
    const connection = await Connection.connect({
      address: process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233',
    });
    return new Client({ connection });
  }

  /** List all tenants for the SYSTEM_ADMIN panel (§20.4.1). */
  async listTenants(): Promise<Tenant[]> {
    return this.prisma.$queryRaw<Tenant[]>`
      SELECT * FROM platform.tenants ORDER BY created_at DESC
    `;
  }

  private async provisionTenantTopics(tenantId: string): Promise<void> {
    const provisioner = new KafkaTopicProvisioner();
    try {
      await provisioner.connect();
      await provisioner.provisionTenant(tenantId);
      logger.info({ tenantId }, 'tenant kafka topics provisioned');
    } catch (err) {
      logger.error({ tenantId, err }, 'kafka.topic.provision.failed');
    } finally {
      await provisioner.disconnect().catch(() => undefined);
    }
  }
}
