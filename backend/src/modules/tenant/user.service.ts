// User Service — Phase 2 (gap closure)
// TENANT_ADMIN manages users within their own tenant.
// Operates on platform schema (cross-tenant tables: platform.users, platform.tenant_memberships).
// Source: spec §14.3 User Management APIs, §6.4 RBAC matrix.
// Emits: identity.user.created.v1, identity.user.role_changed.v1, identity.user.password_reset.v1

import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  OnModuleDestroy,
} from '@nestjs/common';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { KafkaProducer } from '@cos/shared';
import { createLogger } from '@cos/logger';
import { CosRole } from '@cos/types';
import { KeycloakAdminService } from '../identity/keycloak-admin.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { ChangeRoleDto } from './dto/change-role.dto';
import type { SetRolesDto } from './dto/set-roles.dto';

// SYSTEM_ADMIN is a cross-tenant platform role (spec §6.7 — "NOT provisioned to any tenant"). The
// user-management endpoints are gated by @Roles(TENANT_ADMIN), and the role field is validated only
// by @IsEnum(CosRole), which includes SYSTEM_ADMIN. Without this guard a TENANT_ADMIN could create a
// user (or change a role) to SYSTEM_ADMIN; the Keycloak `role` attribute → JWT `role` claim mapper
// (construction-os-realm.json) would then mint a SYSTEM_ADMIN token on that user's login, granting
// cross-tenant platform control (TenantController @Roles(SYSTEM_ADMIN): list/provision/deactivate any
// tenant, reassign dedicated DB URLs). Reject it here — the service is the authoritative boundary.
function assertRoleAssignableByTenant(role: CosRole): void {
  if (role === CosRole.SYSTEM_ADMIN) {
    throw new ForbiddenException(
      'SYSTEM_ADMIN is a cross-tenant platform role and cannot be assigned to a tenant user',
    );
  }
}

const logger = createLogger('user-service');

// A readable, complexity-satisfying one-time password for admin-triggered resets. Fixed shape
// (4 upper · 4 lower · 3 digit, hyphen-grouped, e.g. "KMNP-qrst-234") guarantees mixed case + digit +
// symbol for any Keycloak password policy; ambiguous glyphs (0/O, 1/l/I) are excluded for hand-off by
// voice or paper. Randomness is from the platform CSPRNG. Keycloak stores it as temporary=true, so it
// is single-use — never persisted or logged by COS.
function generateTempPassword(): string {
  const pick = (set: string, n: number, rnd: Uint8Array, off: number): string =>
    Array.from({ length: n }, (_, i) => set[rnd[off + i]! % set.length]).join('');
  const rnd = globalThis.crypto.getRandomValues(new Uint8Array(11));
  const upper = pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 4, rnd, 0);
  const lower = pick('abcdefghijkmnpqrstuvwxyz', 4, rnd, 4);
  const digit = pick('23456789', 3, rnd, 8);
  return `${upper}-${lower}-${digit}`;
}

export interface UserRow {
  user_id: string;
  tenant_id: string;
  keycloak_user_id: string;
  // @pdpa(category: "contact") — email is PII
  email: string;
  // @pdpa(category: "contact") — phone_number is PII (Path A users only); NULL for email-only accounts
  phone_number: string | null;
  // @pdpa(category: "identity") — display_name is PII
  display_name: string;
  // @pdpa(category: "identity") — a profile photo identifies the person; NULL until one is uploaded
  photo_url: string | null;
  // Org unit for HR (nullable — set by seed/HR, not required at account creation).
  department: string | null;
  is_active: boolean;
  mfa_enabled: boolean;
  // Last authenticated request (throttled) — drives the Tenant Admin User Audit (dormant users).
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
  role: string; // joined from platform.tenant_memberships
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedUsers {
  data: UserRow[];
  pagination: {
    limit: number;
    offset: number;
    page: number;
    total: number;
  };
}

@Injectable()
export class UserService implements OnModuleDestroy {
  // Platform PrismaClient — NOT TenantPrismaService (platform.users is cross-tenant)
  private readonly prisma = createPrismaClient();
  private readonly kafka = new KafkaProducer();

  constructor(private readonly keycloakAdmin: KeycloakAdminService) {}

  /** Close the Prisma connection on shutdown so the query-engine socket does not leak. */
  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async listUsers(tenantId: string, params: PaginationParams): Promise<PaginatedUsers> {
    const { limit, offset } = params;

    const [rows, countResult] = await Promise.all([
      this.prisma.$queryRaw<UserRow[]>`
        SELECT
          u.user_id,
          u.tenant_id,
          u.keycloak_user_id,
          u.email,
          u.phone_number,
          u.display_name,
          u.photo_url,
          u.department,
          u.is_active,
          u.mfa_enabled,
          u.last_seen_at,
          u.created_at,
          u.updated_at,
          m.role
        FROM platform.users u
        JOIN platform.tenant_memberships m
          ON m.user_id = u.user_id AND m.tenant_id = u.tenant_id
        WHERE u.tenant_id = ${tenantId}::uuid
          AND u.is_active = true
        ORDER BY u.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM platform.users u
        WHERE u.tenant_id = ${tenantId}::uuid
          AND u.is_active = true
      `,
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return {
      data: rows,
      pagination: {
        limit,
        offset,
        page: Math.floor(offset / limit) + 1,
        total,
      },
    };
  }

  /**
   * The signed-in user's own record. Self-service, so it is NOT gated on TENANT_ADMIN like the rest
   * of this service — but it is still tenant-scoped, and the user_id comes from the JWT, never from
   * the caller, so it cannot be pointed at anyone else's row.
   */
  async getMe(tenantId: string, userId: string): Promise<UserRow> {
    const rows = await this.prisma.$queryRaw<UserRow[]>`
      SELECT
        u.user_id, u.tenant_id, u.keycloak_user_id, u.email, u.phone_number, u.display_name,
        u.photo_url, u.is_active, u.mfa_enabled, u.last_seen_at, u.created_at, u.updated_at, m.role
      FROM platform.users u
      JOIN platform.tenant_memberships m
        ON m.user_id = u.user_id AND m.tenant_id = u.tenant_id
      WHERE u.user_id = ${userId}::uuid AND u.tenant_id = ${tenantId}::uuid
    `;
    const me = rows[0];
    if (!me) throw new NotFoundException({ code: 'COS-USER-404', message: 'User not found' });
    return me;
  }

  /**
   * Set or clear the signed-in user's profile photo. `null` clears it, which is the only way back to
   * initials once a photo is set.
   */
  async updateMyPhoto(tenantId: string, userId: string, photoUrl: string | null): Promise<UserRow> {
    await this.prisma.$executeRaw`
      UPDATE platform.users
      SET photo_url = ${photoUrl}::text, updated_at = now()
      WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid
    `;
    return this.getMe(tenantId, userId);
  }

  async createUser(dto: CreateUserDto, tenantId: string, actorId: string): Promise<UserRow> {
    assertRoleAssignableByTenant(dto.role);
    if (!dto.phone_number && !dto.email) {
      throw new BadRequestException('Either phone_number (Path A) or email (Path B) is required');
    }
    if (dto.phone_number && dto.email) {
      throw new BadRequestException('Provide either phone_number or email — not both');
    }

    const isPathA = Boolean(dto.phone_number);
    const emailValue = isPathA ? '' : dto.email!;

    // Conflict guard (parameterized — no string interpolation)
    const existing = isPathA
      ? await this.prisma.$queryRaw<Array<{ user_id: string }>>`
          SELECT user_id FROM platform.users
          WHERE phone_number = ${dto.phone_number!} LIMIT 1
        `
      : await this.prisma.$queryRaw<Array<{ user_id: string }>>`
          SELECT user_id FROM platform.users
          WHERE keycloak_user_id = ${dto.keycloak_user_id ?? dto.email!} LIMIT 1
        `;

    if (existing.length) {
      throw new ConflictException(`User with this identity already exists`);
    }

    // Step 1 — get tenant realm for Keycloak provisioning
    const [tenant] = await this.prisma.$queryRaw<Array<{ keycloak_realm: string }>>`
      SELECT keycloak_realm FROM platform.tenants
      WHERE tenant_id = ${tenantId}::uuid AND is_active = true
      LIMIT 1
    `;
    if (!tenant) throw new BadRequestException('Tenant not found or inactive');

    // Step 2 — provision Keycloak user; get UUID for keycloak_user_id column
    // userId placeholder: generate early so it can be set as a Keycloak attribute
    const userIdPlaceholder = globalThis.crypto.randomUUID();
    let keycloakUserId: string;

    if (isPathA) {
      const { keycloakUserId: kcId } = await this.keycloakAdmin.provisionPhoneUser(
        dto.phone_number!,
        dto.display_name,
        tenant.keycloak_realm,
        tenantId,
        userIdPlaceholder,
        dto.role,
      );
      keycloakUserId = kcId;
    } else {
      const { keycloakUserId: kcId } = await this.keycloakAdmin.createEmailUser(
        dto.email!,
        dto.display_name,
        tenant.keycloak_realm,
        tenantId,
        userIdPlaceholder,
        dto.role,
      );
      keycloakUserId = kcId;
    }

    // Step 3 — create COS user record; rollback Keycloak user on failure
    let user: UserRow;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const [created] = await tx.$queryRaw<UserRow[]>`
          INSERT INTO platform.users
            (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
          VALUES
            (${userIdPlaceholder}::uuid, ${tenantId}::uuid, ${keycloakUserId},
             ${isPathA ? dto.phone_number! : null}, ${emailValue}, ${dto.display_name})
          RETURNING
            user_id, tenant_id, keycloak_user_id, email, phone_number, display_name,
            photo_url, is_active, mfa_enabled, last_seen_at, created_at, updated_at
        `;

        await tx.$queryRaw`
          INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
          VALUES (${tenantId}::uuid, ${created!.user_id}::uuid, ${dto.role}::platform."CosRoleEnum")
        `;

        return created!;
      });
    } catch (err) {
      // Rollback Keycloak user to avoid orphaned account
      await this.keycloakAdmin
        .deleteUser(keycloakUserId, tenant.keycloak_realm)
        .catch((e) => logger.error({ keycloakUserId, err: e }, 'keycloak.rollback.failed'));
      throw err;
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
    assertRoleAssignableByTenant(dto.role);
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
      SET role = ${dto.role}::platform."CosRoleEnum"
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

  /** A user's primary role (tenant_memberships) + additional roles (multi-role, union model). */
  async getUserRoles(
    userId: string,
    tenantId: string,
  ): Promise<{ primary_role: string; additional_roles: string[] }> {
    const [membership] = await this.prisma.$queryRaw<Array<{ role: string }>>`
      SELECT role FROM platform.tenant_memberships
      WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid
      LIMIT 1
    `;
    if (!membership) {
      throw new NotFoundException(`User ${userId} not found in tenant`);
    }
    const extra = await this.prisma.$queryRaw<Array<{ role: string }>>`
      SELECT role FROM platform.user_additional_roles
      WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid
      ORDER BY role
    `;
    return { primary_role: membership.role, additional_roles: extra.map((r) => r.role) };
  }

  /**
   * Set a user's primary + additional roles (multi-role). Primary lands on tenant_memberships; the
   * additional roles replace platform.user_additional_roles (deduped, primary never duplicated there).
   * The stateless JWT keeps the OLD primary until the target re-logs in — same as changeRole.
   */
  async setUserRoles(
    userId: string,
    dto: SetRolesDto,
    tenantId: string,
    actorId: string,
  ): Promise<void> {
    assertRoleAssignableByTenant(dto.primary_role);
    dto.additional_roles.forEach((r) => assertRoleAssignableByTenant(r));
    const additional = [...new Set(dto.additional_roles)].filter((r) => r !== dto.primary_role);
    const assignedBy = actorId && actorId !== 'system' ? actorId : null;

    // One transaction for the whole role change. These three statements used to run unwrapped, so a
    // failure after the DELETE (a dropped connection, a rejected enum value) left the user holding the
    // NEW primary role with NO additional roles — a silently under-privileged account that nothing
    // retries or repairs. Role state is a security boundary: it moves all at once or not at all.
    const oldRole = await this.prisma.$transaction(async (tx) => {
      const [membership] = await tx.$queryRaw<Array<{ role: string }>>`
        SELECT role FROM platform.tenant_memberships
        WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid
        LIMIT 1
        FOR UPDATE
      `;
      if (!membership) {
        throw new NotFoundException(`User ${userId} not found in tenant`);
      }

      await tx.$queryRaw`
        UPDATE platform.tenant_memberships
        SET role = ${dto.primary_role}::platform."CosRoleEnum"
        WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid
      `;
      await tx.$queryRaw`
        DELETE FROM platform.user_additional_roles
        WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid
      `;
      // Single set-based INSERT rather than one round trip per role. unnest() over an empty array
      // yields zero rows, so the empty case needs no branch (repo idiom: bind the JS array and cast).
      await tx.$queryRaw`
        INSERT INTO platform.user_additional_roles (user_id, tenant_id, role, assigned_by)
        SELECT ${userId}::uuid, ${tenantId}::uuid, r::platform."CosRoleEnum", ${assignedBy}::uuid
        FROM unnest(${additional}::text[]) AS r
        ON CONFLICT (user_id, tenant_id, role) DO NOTHING
      `;

      return membership.role;
    });

    logger.info(
      { userId, tenantId, actorId, primaryRole: dto.primary_role, additionalRoles: additional },
      'user.roles_set',
    );
    if (oldRole !== dto.primary_role) {
      await this.publishEvent('identity.user.role_changed.v1', {
        tenant_id: tenantId,
        user_id: userId,
        old_role: oldRole,
        new_role: dto.primary_role,
      });
    }
  }

  /**
   * Admin-triggered password reset (TENANT_ADMIN). Sets a fresh temporary password on the target's
   * Keycloak account and returns the plaintext ONCE for secure manual hand-off; Keycloak forces the
   * user to choose a new password at next sign-in (temporary=true). COS never stores the plaintext.
   * Emits identity.user.password_reset.v1 for the audit trail (no credential in the event).
   *
   * Note: for Path A (phone/OTP) users the ephemeral login credential is re-set on each OTP exchange,
   * so this temporary password is chiefly meaningful for Path B (email/password) sign-in.
   */
  async resetPassword(
    userId: string,
    tenantId: string,
    actorId: string,
  ): Promise<{ temporary_password: string; display_name: string }> {
    const [user] = await this.prisma.$queryRaw<
      Array<{ keycloak_user_id: string; display_name: string }>
    >`
      SELECT keycloak_user_id, display_name FROM platform.users
      WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid AND is_active = true
      LIMIT 1
    `;
    if (!user) {
      throw new NotFoundException(`User ${userId} not found in tenant`);
    }
    const [tenant] = await this.prisma.$queryRaw<Array<{ keycloak_realm: string }>>`
      SELECT keycloak_realm FROM platform.tenants
      WHERE tenant_id = ${tenantId}::uuid AND is_active = true
      LIMIT 1
    `;
    if (!tenant) throw new BadRequestException('Tenant not found or inactive');

    const tempPassword = generateTempPassword();
    await this.keycloakAdmin.setTemporaryPassword(
      user.keycloak_user_id,
      tenant.keycloak_realm,
      tempPassword,
    );

    logger.info({ userId, tenantId, actorId }, 'user.password_reset');
    await this.publishEvent('identity.user.password_reset.v1', {
      tenant_id: tenantId,
      user_id: userId,
      reset_by: actorId,
      method: 'temporary_password',
    });

    return { temporary_password: tempPassword, display_name: user.display_name };
  }

  /**
   * Standards-compliant admin-initiated reset (TENANT_ADMIN): email the target a single-use, 15-minute
   * UPDATE_PASSWORD action-token link (NIST 800-63B Rev.4) so they set their OWN password — no plaintext is
   * ever handled by COS. Requires the user to have an email on file (Path B / any user once unified-login
   * gives everyone an email); Path A phone-only users fall back to the temporary-password reset above.
   * Emits identity.user.password_reset.v1 (method = email_link).
   */
  async sendPasswordResetLink(
    userId: string,
    tenantId: string,
    actorId: string,
  ): Promise<{ email: string }> {
    const [user] = await this.prisma.$queryRaw<
      Array<{ keycloak_user_id: string; email: string | null }>
    >`
      SELECT keycloak_user_id, email FROM platform.users
      WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid AND is_active = true
      LIMIT 1
    `;
    if (!user) {
      throw new NotFoundException(`User ${userId} not found in tenant`);
    }
    if (!user.email || user.email === '') {
      throw new BadRequestException(
        'User has no email on file — use the temporary-password reset instead',
      );
    }
    const [tenant] = await this.prisma.$queryRaw<Array<{ keycloak_realm: string }>>`
      SELECT keycloak_realm FROM platform.tenants
      WHERE tenant_id = ${tenantId}::uuid AND is_active = true
      LIMIT 1
    `;
    if (!tenant) throw new BadRequestException('Tenant not found or inactive');

    // 15 minutes — NIST 800-63B Rev.4 wants a short (< 60 min), single-use reset token.
    await this.keycloakAdmin.sendPasswordResetEmail(
      user.keycloak_user_id,
      tenant.keycloak_realm,
      900,
    );

    logger.info({ userId, tenantId, actorId }, 'user.password_reset_link_sent');
    await this.publishEvent('identity.user.password_reset.v1', {
      tenant_id: tenantId,
      user_id: userId,
      reset_by: actorId,
      method: 'email_link',
    });

    return { email: user.email };
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
        correlation_id: globalThis.crypto.randomUUID(),
        payload,
      });
      await this.kafka.disconnect();
    } catch (err) {
      logger.error({ event_type: eventType, err }, 'kafka.publish.failed');
    }
  }
}
