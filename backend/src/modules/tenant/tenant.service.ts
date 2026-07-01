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
import { Tenant } from '@prisma/client';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { KafkaProducer, KafkaTopicProvisioner } from '@cos/shared';
import { createLogger } from '@cos/logger';
import { Connection, Client } from '@temporalio/client';
import { CreateTenantDto } from './dto/create-tenant.dto';

const logger = createLogger('tenant-service');

@Injectable()
export class TenantService implements OnModuleDestroy {
  // Platform PrismaClient — NOT TenantPrismaService (this operates cross-tenant)
  private readonly prisma = createPrismaClient();
  private readonly kafka = new KafkaProducer();

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

      logger.info({ tenantCode: dto.tenantCode, createdBy }, 'Tenant record created');

      return created!;
    });

    // Provision the tenant's per-tenant Kafka topic set (spec §7.3) before any of the
    // tenant's events are produced. Idempotent; non-fatal so onboarding is not blocked
    // by a transient Kafka outage (topics can be re-provisioned by re-running onboarding).
    await this.provisionTenantTopics(tenant.tenantId);

    logger.info(
      { tenantCode: dto.tenantCode, keycloakRealm },
      'Keycloak realm assigned to tenant record',
    );

    // 4. Emit identity.tenant.created.v1 (non-fatal — outbox pattern handles retries)
    await this.publishEvent('identity.tenant.created.v1', {
      tenant_id: tenant.tenantId,
      tenant_code: tenant.tenantCode,
      tenant_name: tenant.tenantName,
      plan_type: tenant.planType,
    });

    return tenant;
  }

  async deactivateTenant(tenantId: string, actorId: string): Promise<void> {
    const [tenant] = await this.prisma.$queryRaw<Tenant[]>`
      UPDATE platform.tenants
      SET is_active = false, updated_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND is_active = true
      RETURNING *
    `;
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found or already inactive`);
    }
    logger.info({ tenantId, actorId }, 'Tenant deactivated');

    await this.publishEvent('identity.tenant.deactivated.v1', { tenant_id: tenantId });
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
    const affected = await this.prisma.$executeRaw`
      UPDATE platform.tenants
      SET dedicated_db_url = ${dedicatedDbUrl}, updated_at = now()
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
    await this.publishEvent('platform.enterprise.contract_signed.v1', {
      tenant_id: tenantId,
      contract_reference: contractReference ?? null,
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

  private async publishEvent<T>(eventType: string, payload: T): Promise<void> {
    try {
      await this.kafka.connect();
      await this.kafka.publish<T>({
        event_type: eventType,
        event_version: '1.0',
        tenant_id: 'platform',
        actor_id: 'system',
        occurred_at: new Date().toISOString(),
        correlation_id: globalThis.crypto.randomUUID(),
        payload,
      });
      await this.kafka.disconnect();
    } catch (err) {
      logger.error({ event_type: eventType, err }, 'kafka.publish.failed');
    }
  }
}
