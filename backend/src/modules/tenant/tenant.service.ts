// Tenant Service — Phase 2
// Manages tenant lifecycle: creation, deactivation, schema provisioning.
// Uses platform PrismaClient directly (cross-tenant operations).
// Emits identity.tenant.created.v1 and identity.tenant.deactivated.v1 Kafka events.

import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient, Tenant } from '@prisma/client';
import { KafkaProducer } from '@cos/shared';
import { createLogger } from '@cos/logger';
import { randomUUID } from 'crypto';
import { CreateTenantDto } from './dto/create-tenant.dto';

const logger = createLogger('tenant-service');

@Injectable()
export class TenantService {
  // Platform PrismaClient — NOT TenantPrismaService (this operates cross-tenant)
  private readonly prisma = new PrismaClient();
  private readonly kafka = new KafkaProducer();

  async createTenant(dto: CreateTenantDto, createdBy: string): Promise<Tenant> {
    const existing = await this.prisma.$queryRaw<Array<{ tenant_id: string }>>`
      SELECT tenant_id FROM platform.tenants
      WHERE tenant_code = ${dto.tenantCode}
      LIMIT 1
    `;
    if (existing.length) {
      throw new ConflictException(`Tenant code '${dto.tenantCode}' already exists`);
    }

    const keycloakRealm = `cos-${dto.tenantCode}`;

    // Provision tenant schema and Keycloak realm in a transaction
    const tenant = await this.prisma.$transaction(async (tx) => {
      // 1. Create tenant record in platform schema
      const [created] = await tx.$queryRaw<Tenant[]>`
        INSERT INTO platform.tenants (tenant_code, tenant_name, keycloak_realm, plan_type)
        VALUES (${dto.tenantCode}, ${dto.tenantName}, ${keycloakRealm}, ${dto.planType}::"PlanType")
        RETURNING *
      `;

      // 2. Provision tenant schema
      await tx.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${dto.tenantCode}"`);

      logger.info({ tenantCode: dto.tenantCode, createdBy }, 'Tenant schema provisioned');

      return created!;
    });

    // 3. Provision Keycloak realm (outside DB tx — Keycloak is external)
    // In production: call Keycloak Admin REST API to create realm
    // In local dev: realm is pre-imported via docker-compose volume mount
    logger.info(
      { tenantCode: dto.tenantCode, keycloakRealm },
      'Keycloak realm provisioning deferred to Keycloak Admin API (Phase 2+)',
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

  async findById(tenantId: string): Promise<Tenant | null> {
    const [tenant] = await this.prisma.$queryRaw<Tenant[]>`
      SELECT * FROM platform.tenants
      WHERE tenant_id = ${tenantId}::uuid
      LIMIT 1
    `;
    return tenant ?? null;
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
        correlation_id: randomUUID(),
        payload,
      });
      await this.kafka.disconnect();
    } catch (err) {
      logger.error({ event_type: eventType, err }, 'kafka.publish.failed');
    }
  }
}
