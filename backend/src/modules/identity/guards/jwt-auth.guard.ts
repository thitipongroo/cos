import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';
import {
  CLS_TENANT_ID,
  CLS_USER_ID,
  CLS_USER_ROLE,
  CLS_TENANT_CODE,
  CLS_DEDICATED_DB_URL,
} from '../../../shared/context/cls-context';
import type { AuthenticatedUser } from '../strategies/keycloak-jwt.strategy';
import { enforceMfaForPrivilegedRoles } from '../../../shared/guards/mfa-enforcement';
import { LastSeenService } from '../last-seen.service';

/**
 * Validates the Keycloak RS256 JWT on every protected endpoint.
 *
 * Under @nestjs/platform-fastify, Passport's `req.user` assignment does NOT reliably reach downstream
 * interceptors or Scope.REQUEST providers (Fastify clones the request). `handleRequest` receives the
 * validated user as a direct argument, so it is the reliable place to publish the tenant context — into
 * CLS (read by TenantPrismaService et al.). The global ClsModule middleware has already opened the CLS
 * context for this request, so values set here persist through the whole pipeline.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('keycloak-jwt') {
  constructor(
    private readonly cls: ClsService,
    private readonly lastSeen: LastSeenService,
  ) {
    super();
  }

  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    // Throws UnauthorizedException when the token is missing/invalid; otherwise returns the user.
    const result = super.handleRequest(err, user, info, context) as TUser;

    const u = result as unknown as AuthenticatedUser | undefined;
    if (u?.tenant_id) {
      // Layer 2 MFA gate — reject privileged roles (TENANT_ADMIN/FINANCE) whose token lacks proof of
      // OTP. Gated by MFA_ENFORCE (default off) so it ships safely before the realm acr is verified.
      enforceMfaForPrivilegedRoles(u);
      if (this.cls.isActive()) {
        this.cls.set(CLS_TENANT_ID, u.tenant_id);
        this.cls.set(CLS_USER_ID, u.user_id);
        this.cls.set(CLS_USER_ROLE, u.role);
        this.cls.set(CLS_TENANT_CODE, u.tenantCode);
        this.cls.set(CLS_DEDICATED_DB_URL, u.dedicatedDbUrl);
      }
      // Record activity for the Tenant Admin User Audit — fire-and-forget + throttled, so it never
      // blocks the request. Runs on every authenticated request → captures Path A and Path B alike.
      this.lastSeen.touch(u.user_id, u.tenant_id);
    }
    return result;
  }
}
