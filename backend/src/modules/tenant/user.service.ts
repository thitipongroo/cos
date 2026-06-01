// User Service — Phase 2 (gap closure)
// TENANT_ADMIN manages users within their own tenant.
// Operates on platform schema (cross-tenant tables: platform.users, platform.tenant_memberships).
// Source: spec §14.3 User Management APIs, §6.4 RBAC matrix.
// Emits: identity.user.created.v1, identity.user.role_changed.v1

import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { KafkaProducer } from '@cos/shared';
import { createLogger } from '@cos/logger';
import { randomUUID } from 'crypto';
import type { CreateUserDto } from './dto/create-user.dto';
import type { ChangeRoleDto } from './dto/change-role.dto';

const logger = createLogger('user-service');

export interface UserRow {
  user_id: string;
  tenant_id: string;
  keycloak_user_id: string;
  // @pdpa(category: "contact") — email is PII
  email: string;
  // @pdpa(category: "identity") — display_name is PII
  display_name: string;
  is_active: boolean;
  mfa_enabled: boolean;
  created_at: Date;
  updated_at: Date;
  role: string; // joined from platform.tenant_memberships
}

@Injectable()
export class UserService {
  // Platform PrismaClient — NOT TenantPrismaService (platform.users is cross-tenant)
  private readonly prisma = new PrismaClient();
  private readonly kafka = new KafkaProducer();

  async listUsers(tenantId: string): Promise<UserRow[]> {
    return this.prisma.$queryRaw<UserRow[]>`
      SELECT
        u.user_id,
        u.tenant_id,
        u.keycloak_user_id,
        u.email,
        u.display_name,
        u.is_active,
        u.mfa_enabled,
        u.created_at,
        u.updated_at,
        m.role
      FROM platform.users u
      JOIN platform.tenant_memberships m
        ON m.user_id = u.user_id AND m.tenant_id = u.tenant_id
      WHERE u.tenant_id = ${tenantId}::uuid
        AND u.is_active = true
      ORDER BY u.created_at DESC
    `;
  }

  async createUser(dto: CreateUserDto, tenantId: string, actorId: string): Promise<UserRow> {
    if (!dto.phone_number && !dto.email) {
      throw new BadRequestException('Either phone_number (Path A) or email (Path B) is required');
    }
    if (dto.phone_number && dto.email) {
      throw new BadRequestException('Provide either phone_number or email — not both');
    }

    // Determine keycloak_user_id and email column value per path
    const isPathA = Boolean(dto.phone_number);
    const keycloakUserId = isPathA ? dto.phone_number! : (dto.keycloak_user_id ?? dto.email!);
    const emailValue = isPathA ? '' : dto.email!;

    // Conflict guard: keycloak_user_id must be globally unique (UNIQUE constraint)
    const existing = await this.prisma.$queryRaw<Array<{ user_id: string }>>`
      SELECT user_id FROM platform.users
      WHERE keycloak_user_id = ${keycloakUserId}
      LIMIT 1
    `;
    if (existing.length) {
      throw new ConflictException(`User with this identity already exists`);
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const [created] = await tx.$queryRaw<UserRow[]>`
        INSERT INTO platform.users
          (tenant_id, keycloak_user_id, email, display_name)
        VALUES
          (${tenantId}::uuid, ${keycloakUserId}, ${emailValue}, ${dto.display_name})
        RETURNING
          user_id, tenant_id, keycloak_user_id, email, display_name,
          is_active, mfa_enabled, created_at, updated_at
      `;

      await tx.$queryRaw`
        INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
        VALUES (${tenantId}::uuid, ${created!.user_id}::uuid, ${dto.role}::"CosRoleEnum")
      `;

      return created!;
    });

    if (!isPathA && !dto.keycloak_user_id) {
      // Path B without a Keycloak UUID: email used as keycloak_user_id placeholder.
      // Keycloak Admin API provisioning is deferred — see Phase 2 constraints (createTenant pattern).
      logger.warn(
        { userId: user.user_id, tenantId },
        'user.create.keycloak_deferred — Keycloak user creation not yet implemented; ' +
          'email stored as keycloak_user_id placeholder',
      );
    }

    logger.info({ userId: user.user_id, tenantId, actorId, role: dto.role }, 'user.created');

    await this.publishEvent('identity.user.created.v1', {
      tenant_id: tenantId,
      user_id: user.user_id,
      // @pdpa: email transmitted in event for downstream provisioning only
      email: emailValue,
      role: dto.role,
    });

    return { ...user, role: dto.role };
  }

  async changeRole(
    userId: string,
    dto: ChangeRoleDto,
    tenantId: string,
    actorId: string,
  ): Promise<void> {
    const [membership] = await this.prisma.$queryRaw<Array<{ role: string }>>`
      SELECT role FROM platform.tenant_memberships
      WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid
      LIMIT 1
    `;
    if (!membership) {
      throw new NotFoundException(`User ${userId} not found in tenant`);
    }

    const oldRole = membership.role;
    await this.prisma.$queryRaw`
      UPDATE platform.tenant_memberships
      SET role = ${dto.role}::"CosRoleEnum"
      WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid
    `;

    logger.info({ userId, tenantId, actorId, oldRole, newRole: dto.role }, 'user.role_changed');

    await this.publishEvent('identity.user.role_changed.v1', {
      tenant_id: tenantId,
      user_id: userId,
      old_role: oldRole,
      new_role: dto.role,
    });
  }

  async deactivateUser(userId: string, tenantId: string, actorId: string): Promise<void> {
    const [user] = await this.prisma.$queryRaw<Array<{ user_id: string }>>`
      UPDATE platform.users
      SET is_active = false, updated_at = now()
      WHERE user_id = ${userId}::uuid
        AND tenant_id = ${tenantId}::uuid
        AND is_active = true
      RETURNING user_id
    `;
    if (!user) {
      throw new NotFoundException(`User ${userId} not found or already inactive`);
    }
    logger.info({ userId, tenantId, actorId }, 'user.deactivated');
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
