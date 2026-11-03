// First TENANT_ADMIN of a tenant — ADR-110, spec §6.7 "Tenant bootstrap" and §7.6.
//
// Tenant creation writes no user, and every user-management endpoint is @Roles(TENANT_ADMIN) inside the caller's
// own tenant, so a new tenant had nobody who could sign in. A SYSTEM_ADMIN may create that first administrator —
// and only that one (product owner, 2026-11-02): while the tenant has an active TENANT_ADMIN, both actions here are
// refused and the tenant's own administrator manages everyone else.
//
// The account is a Path B (email) account, the only path TENANT_ADMIN may use (§5.4.4). It is created by
// UserService.createUser — same Keycloak provisioning, conflict guard, rollback and identity.user.created.v1 — and
// receives a Keycloak UPDATE_PASSWORD invitation valid for 72 hours: the customer sets their own password and
// enrols MFA at first sign-in; COS never handles a password.
//
// Both actions are audited under the TARGET tenant with the SYSTEM_ADMIN's justification (§6.7), inside the
// transaction that makes them happen.

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { createLogger } from '@cos/logger';
import { CosRole } from '@cos/types';
import type { Prisma } from '@prisma/client';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { KeycloakAdminService } from '../identity/keycloak-admin.service';
import { UserService } from './user.service';
import { writeTenantAdminAudit } from './tenant.service';
import { lockTenantAdmins, TENANT_ADMIN_ERROR, tenantAdmins } from './public/tenant-admins';

const logger = createLogger('tenant-admin-bootstrap');

/** QM-15 flag for both endpoints. New feature and an authorization change, so default OFF. */
export const BOOTSTRAP_ADMIN_FLAG = 's1.tenant.bootstrap-admin';

/** Invitation link lifetime — 72 hours (product owner, 2026-11-02). The admin reset link stays 15 minutes. */
export const ADMIN_INVITE_LIFESPAN_SEC = 72 * 60 * 60;

export { TENANT_ADMIN_ERROR };

export interface TenantAdminInviteResult {
  user_id: string;
  email: string;
  /** False when Keycloak could not send the email; the account exists and the invitation can be resent. */
  invite_sent: boolean;
  invite_expires_at: Date | null;
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class TenantAdminBootstrapService implements OnModuleDestroy {
  private readonly prisma = createPrismaClient();

  constructor(
    private readonly users: UserService,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /** `POST /admin/tenants/{tenantId}/tenant-admin` — create the first administrator and invite them. */
  async bootstrap(
    tenantId: string,
    input: { email: string; display_name: string },
    actorId: string,
    justification: string,
  ): Promise<TenantAdminInviteResult> {
    const realm = await this.activeTenantRealm(this.prisma, tenantId);

    // Checked before Keycloak is touched, so the common refusal creates and deletes nothing. Not sufficient on its
    // own: two SYSTEM_ADMINs can both pass it, which the re-check under the lock below settles.
    if ((await tenantAdmins(this.prisma, tenantId)).length > 0) throw alreadyHasAdmin();

    const user = await this.users.createUser(
      { email: input.email, display_name: input.display_name, role: CosRole.TENANT_ADMIN },
      tenantId,
      actorId,
      async (tx, created) => {
        await lockTenantAdmins(tx, tenantId);
        // Excludes the row this transaction just inserted; READ COMMITTED gives the statement a fresh snapshot,
        // so an administrator committed by a concurrent bootstrap while we waited for the lock is visible here.
        if ((await tenantAdmins(tx, tenantId, created.user_id)).length > 0) throw alreadyHasAdmin();
        await writeTenantAdminAudit(tx, {
          tenantId,
          actorId,
          action: 'tenant.bootstrap_admin',
          justification,
          extra: { user_id: created.user_id },
        });
      },
    );

    // After commit: a mail server that is down must not undo a correct account. The SYSTEM_ADMIN resends.
    const sent = await this.sendInvite(user.keycloak_user_id, realm, tenantId, user.user_id);
    logger.info({ tenantId, userId: user.user_id, actorId, sent }, 'tenant_admin.bootstrapped');
    return inviteResult(user.user_id, user.email, sent);
  }

  /**
   * `POST /admin/tenants/{tenantId}/tenant-admin/invite` — send the invitation again, while it is unused (see
   * unusedInvitation; refused with 409 COS-TADM-002).
   *
   * The audit row commits BEFORE the email is sent, so an email that went out is always recorded; one that failed
   * leaves a recorded request and `invite_sent: false`.
   */
  async resendInvite(
    tenantId: string,
    actorId: string,
    justification: string,
  ): Promise<TenantAdminInviteResult> {
    const target = await this.unusedInvitation(tenantId, notResendable, async (tx, t) => {
      await writeTenantAdminAudit(tx, {
        tenantId,
        actorId,
        action: 'tenant.resend_admin_invite',
        justification,
        extra: { user_id: t.userId },
      });
    });

    const sent = await this.sendInvite(
      target.keycloak_user_id,
      target.realm,
      tenantId,
      target.userId,
    );
    logger.info({ tenantId, userId: target.userId, actorId, sent }, 'tenant_admin.invite.resent');
    return inviteResult(target.userId, target.email, sent);
  }

  /**
   * `POST /admin/tenants/{tenantId}/tenant-admin/cancel` — withdraw an unused invitation, e.g. one sent to a mistyped
   * address (product owner, 2026-11-03). Same conditions as resend; refused with 409 COS-TADM-003.
   *
   * The account is deactivated in COS (the row stays: the audit trail and the outbox name it) in the audited
   * transaction, so the tenant has no administrator again and can be bootstrapped with the right address. The Keycloak
   * account is then deleted, which kills the link it holds; a 404 means it is already gone. If the delete fails the
   * account is DISABLED instead — a disabled account cannot use its link or sign in — and only if that fails too is the
   * result `keycloak: 'failed'`, for platform engineering to remove by hand (runbook).
   */
  async cancelInvite(
    tenantId: string,
    actorId: string,
    justification: string,
  ): Promise<{ user_id: string; email: string; keycloak: KeycloakRemoval }> {
    const target = await this.unusedInvitation(tenantId, notCancellable, async (tx, t) => {
      await tx.$executeRaw`
        UPDATE platform.users SET is_active = false, updated_at = now()
         WHERE user_id = ${t.userId}::uuid AND tenant_id = ${tenantId}::uuid
      `;
      await writeTenantAdminAudit(tx, {
        tenantId,
        actorId,
        action: 'tenant.cancel_admin_invite',
        justification,
        extra: { user_id: t.userId },
      });
    });

    const keycloak = await this.removeKeycloakAccount(
      target.keycloak_user_id,
      target.realm,
      tenantId,
      target.userId,
    );
    logger.info(
      { tenantId, userId: target.userId, actorId, keycloak },
      'tenant_admin.invite.cancelled',
    );
    return { user_id: target.userId, email: target.email, keycloak };
  }

  /** Delete; a 404 is already deleted; on any other failure disable instead (ADR-110 round 2). */
  private async removeKeycloakAccount(
    keycloakUserId: string,
    realm: string,
    tenantId: string,
    userId: string,
  ): Promise<KeycloakRemoval> {
    try {
      await this.keycloakAdmin.deleteUser(keycloakUserId, realm);
      return 'deleted';
    } catch (err) {
      if ((err as { response?: { status?: number } } | null)?.response?.status === 404)
        return 'deleted';
      logger.warn(
        { tenantId, userId, err: err instanceof Error ? err.message : String(err) },
        'tenant_admin.invite.cancel.keycloak_not_deleted',
      );
    }
    try {
      await this.keycloakAdmin.disableUser(keycloakUserId, realm);
      return 'disabled';
    } catch (err) {
      logger.error(
        { tenantId, userId, err: err instanceof Error ? err.message : String(err) },
        'tenant_admin.invite.cancel.keycloak_not_disabled',
      );
      return 'failed';
    }
  }

  /**
   * The bootstrapped administrator whose invitation is still unused — what resend and cancel may act on — then `act`
   * in a transaction. All three must hold, else `refuse(count, reason)`:
   *
   * - the tenant has exactly ONE active administrator;
   * - that account was created by `bootstrap` (a `tenant.bootstrap_admin` audit row names it) — an administrator the
   *   customer created is the customer's to manage, not a SYSTEM_ADMIN's;
   * - its invitation is unused: Keycloak holds NO credential for it (a Path B account is created with none).
   *
   * Two phases, so no Keycloak call runs inside a transaction (QM-18 — it would hold the administrator lock, the tenant
   * row and a pooled connection for as long as Keycloak takes). Phase 1 reads and asks Keycloak; phase 2, under the
   * administrator lock with the tenant row FOR SHARE, re-checks that the same account is still the only active
   * administrator before `act`. A credential added between the two phases is not seen — a window of one round trip.
   */
  private async unusedInvitation(
    tenantId: string,
    refuse: (count: number, reason: InvitationRefusal) => ConflictException,
    act: (tx: Tx, target: InvitationTarget) => Promise<void>,
  ): Promise<InvitationTarget> {
    const realm = await this.activeTenantRealm(this.prisma, tenantId);
    const admins = await tenantAdmins(this.prisma, tenantId);
    if (admins.length !== 1) throw refuse(admins.length, 'admin_count');
    const userId = admins[0]!.user_id;

    const [user] = await this.prisma.$queryRaw<Array<{ keycloak_user_id: string; email: string }>>`
      SELECT keycloak_user_id, email FROM platform.users
       WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid AND is_active
    `;
    if (!user) throw refuse(admins.length, 'admin_count');

    const [bootstrapped] = await this.prisma.$queryRaw<Array<{ found: number }>>`
      SELECT 1 AS found FROM platform.audit_logs
       WHERE tenant_id = ${tenantId}::uuid
         AND action = 'tenant.bootstrap_admin'
         AND metadata->>'user_id' = ${userId}
       LIMIT 1
    `;
    if (!bootstrapped) throw refuse(admins.length, 'not_bootstrapped');
    if (await this.keycloakAdmin.hasAnyCredential(user.keycloak_user_id, realm)) {
      throw refuse(admins.length, 'invitation_used');
    }
    const target: InvitationTarget = { userId, realm, ...user };

    await this.prisma.$transaction(async (tx) => {
      await lockTenantAdmins(tx, tenantId);
      await this.activeTenantRealm(tx, tenantId, true);
      const now = await tenantAdmins(tx, tenantId);
      if (now.length !== 1 || now[0]!.user_id !== userId) throw refuse(now.length, 'admin_count');
      await act(tx, target);
    });
    return target;
  }

  /**
   * 404 for an unknown tenant, 400 for a deactivated one; its realm otherwise. `lock` takes the row FOR SHARE, so a
   * deactivation cannot commit between this check and the action. SHARE, not UPDATE: it must not conflict with the
   * KEY SHARE lock a concurrent bootstrap holds through the platform.users foreign key.
   */
  private async activeTenantRealm(
    db: Pick<Tx, '$queryRaw'>,
    tenantId: string,
    lock = false,
  ): Promise<string> {
    const [tenant] = lock
      ? await db.$queryRaw<Array<{ is_active: boolean; keycloak_realm: string }>>`
          SELECT is_active, keycloak_realm FROM platform.tenants WHERE tenant_id = ${tenantId}::uuid FOR SHARE
        `
      : await db.$queryRaw<Array<{ is_active: boolean; keycloak_realm: string }>>`
          SELECT is_active, keycloak_realm FROM platform.tenants WHERE tenant_id = ${tenantId}::uuid
        `;
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);
    if (!tenant.is_active) throw new BadRequestException('Tenant not found or inactive');
    return tenant.keycloak_realm;
  }

  /** Keycloak's UPDATE_PASSWORD email, 72 h. False — logged — when it could not be sent. */
  private async sendInvite(
    keycloakUserId: string,
    realm: string,
    tenantId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      await this.keycloakAdmin.sendPasswordResetEmail(
        keycloakUserId,
        realm,
        ADMIN_INVITE_LIFESPAN_SEC,
      );
      return true;
    } catch (err) {
      logger.warn(
        { tenantId, userId, err: err instanceof Error ? err.message : String(err) },
        'tenant_admin.invite.not_sent',
      );
      return false;
    }
  }
}

function alreadyHasAdmin(): ConflictException {
  return new ConflictException({
    error: {
      code: TENANT_ADMIN_ERROR.ALREADY_HAS_ADMIN,
      message:
        'This tenant already has an administrator. Ask them to add users from their own account.',
      messageKey: 'admin.tenantAdmin.error.alreadyHasAdmin',
    },
  });
}

/** The account resend and cancel act on. */
interface InvitationTarget {
  userId: string;
  realm: string;
  keycloak_user_id: string;
  email: string;
}

/** What cancel did to the Keycloak account: removed, disabled instead, or neither (remove it by hand). */
export type KeycloakRemoval = 'deleted' | 'disabled' | 'failed';

/** Why a resend or cancel was refused — `details.reason`, so the operator learns which rule applied. */
type InvitationRefusal = 'admin_count' | 'not_bootstrapped' | 'invitation_used';

function notCancellable(count: number, reason: InvitationRefusal): ConflictException {
  return new ConflictException({
    error: {
      code: TENANT_ADMIN_ERROR.INVITE_NOT_CANCELLABLE,
      message:
        'Only an unused invitation to the tenant administrator created by Construction OS can be cancelled.',
      messageKey: 'admin.tenantAdmin.error.notCancellable',
      details: { tenant_admin_count: count, reason },
    },
  });
}

function notResendable(count: number, reason: InvitationRefusal): ConflictException {
  return new ConflictException({
    error: {
      code: TENANT_ADMIN_ERROR.INVITE_NOT_RESENDABLE,
      message:
        'The invitation can be resent only to the tenant administrator created by Construction OS, while it is unused.',
      messageKey: 'admin.tenantAdmin.error.notResendable',
      details: { tenant_admin_count: count, reason },
    },
  });
}

function inviteResult(userId: string, email: string, sent: boolean): TenantAdminInviteResult {
  return {
    user_id: userId,
    email,
    invite_sent: sent,
    invite_expires_at: sent ? new Date(Date.now() + ADMIN_INVITE_LIFESPAN_SEC * 1000) : null,
  };
}
