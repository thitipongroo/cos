// VendorAuthGuard — external Vendor Portal authentication (ADR-030, §05 §5.4.3).
//
// Replaces the former VendorAuthMiddleware. Two defects made the middleware form unusable:
//
//   1. It published the tenant only onto the request object. TenantPrismaService resolves the tenant
//      from CLS *exclusively* (tenant-prisma.service.ts), and nothing on the vendor path ever called
//      cls.set() — so every vendor request died in db.run() with "Tenant context missing from
//      request". The unit tests missed it because they mock TenantPrismaService wholesale.
//   2. Tier selection read `req.path`, which Fastify does not expose (it has `url` = path + query;
//      cf. the same note in audit.interceptor.ts). Under the Fastify adapter the Tier-1 branch could
//      never match on `req.path` at all.
//
// A guard is the correct shape here for exactly the reason ContractSignTokenGuard documents: the
// global ClsModule middleware has already opened the CLS context by the time guards run, so cls.set()
// reliably persists for the rest of the request even though Fastify clones the request object.
//
//   - Tier 1 (/vendor/rfq/:token...): verify the invitation token (signature + expiry), publish
//     tenant + invitation. The single-use / token_hash / status check stays in the service (it needs
//     tenant-scoped DB access, available only once the tenant context is set here).
//   - Tier 2 (Bearer session + x-vendor-tenant-id header): verify the session token, then confirm an
//     ACTIVE trading relationship for that vendor in that tenant; publish tenant + vendor.
//
// READ-ONLY TRIALS (§7.10, ADR-109). Vendors never pass KeycloakJwtStrategy, so TrialReadOnlyInterceptor cannot see
// their tenant's status. This guard applies the same rule on both tiers: a write into an EXPIRED or
// PENDING_DELETION tenant is refused with 403 COS-PLAN-003 while s1.tenant.trial-lifecycle is on. Reads cost
// nothing; a write costs one primary-key lookup.
//
// Tier selection is driven by the presence of the `:token` ROUTE PARAM, not by matching the raw URL.
// The route table decides which tier applies, so a caller can no longer choose its authentication
// tier by shaping the URL — the concern behind the previous anchored-regex fix (CodeQL
// js/user-controlled-bypass), now removed at the source rather than pattern-matched around.

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import {
  CLS_DEDICATED_DB_URL,
  CLS_TENANT_ID,
  CLS_VENDOR_ID,
  CLS_VENDOR_IDENTITY_ID,
  CLS_VENDOR_INVITATION_ID,
} from '../../shared/context/cls-context';
import { tenantDbForRequest } from '../../shared/context/tenant-db-for-request';
import { assertSafeTenantId } from '../../shared/prisma/assert-safe-tenant-id';
import { FeatureFlagService } from '../../shared/feature-flags/feature-flag.service';
import {
  isReadOnlyWrite,
  isWriteMethod,
  TRIAL_LIFECYCLE_FLAG,
  trialReadOnlyError,
} from '../../shared/interceptors/trial-read-only.interceptor';
import { MagicLinkService } from './magic-link.service';
import { VendorIdentityRepository } from './vendor-identity.repository';

/** The vendor context published onto the request (mirrored into CLS, which is the reliable copy). */
export interface VendorRequest {
  method?: string;
  params?: Record<string, string>;
  headers?: Record<string, string | string[] | undefined>;
  tenantId?: string;
  vendorId?: string;
  vendorIdentityId?: string;
  vendorInvitationId?: string;
}

@Injectable()
export class VendorAuthGuard implements CanActivate {
  constructor(
    private readonly cls: ClsService,
    private readonly magicLink: MagicLinkService,
    private readonly identities: VendorIdentityRepository,
    // @Optional: absent means the flag is off, as the registry default is.
    @Optional() private readonly flags?: FeatureFlagService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<VendorRequest>();

    const token = req.params?.['token'];
    if (token) {
      // ── Tier 1: invitation magic-link ──
      const claims = this.magicLink.verifyInvitationToken(token);
      // tenant_id reaches SET LOCAL via CLS; validate it here so a malformed token fails as 401 at the
      // edge rather than deeper in TenantPrismaService (QM-4 — same guard, applied earlier).
      assertSafeTenantId(claims.tenantId);
      await this.assertWritable(req, claims.tenantId);
      await this.publish(req, { tenantId: claims.tenantId, invitationId: claims.invitationId });
      return true;
    }

    // ── Tier 2: vendor session ──
    const auth = req.headers?.['authorization'];
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing vendor session token');
    }
    const vendorIdentityId = this.magicLink.verifySessionToken(auth.slice(7));

    const tenantId = req.headers?.['x-vendor-tenant-id'];
    if (typeof tenantId !== 'string' || !tenantId) {
      throw new UnauthorizedException('Missing x-vendor-tenant-id header');
    }
    // This header is entirely caller-controlled and ends up in SET LOCAL app.current_tenant_id.
    // Reject a non-UUID before it is used to look anything up.
    assertSafeTenantId(tenantId);

    const relationship = await this.identities.findActiveRelationship(vendorIdentityId, tenantId);
    if (!relationship) {
      throw new ForbiddenException('No active trading relationship with this tenant');
    }

    await this.assertWritable(req, tenantId);
    await this.publish(req, {
      tenantId,
      vendorIdentityId,
      vendorId: relationship.vendor_id,
    });
    return true;
  }

  /** Refuses a vendor write into a tenant whose free trial has ended (§7.10). Reads never query. */
  private async assertWritable(req: VendorRequest, tenantId: string): Promise<void> {
    if (!isWriteMethod(req.method)) return;
    if (!this.flags?.isEnabled(TRIAL_LIFECYCLE_FLAG, { tenantId })) return;
    const status = await this.identities.tenantSubscriptionStatus(tenantId);
    if (isReadOnlyWrite(req.method, status)) throw trialReadOnlyError(status!);
  }

  /**
   * Write the resolved context to CLS (authoritative — survives Fastify's request cloning) and mirror
   * it onto the request object for handlers that read it via @Req().
   */
  private async publish(
    req: VendorRequest,
    ctx: {
      tenantId: string;
      vendorId?: string;
      vendorIdentityId?: string;
      invitationId?: string;
    },
  ): Promise<void> {
    // D50: the tenant's dedicated database, if any; 401 for an inactive tenant, as the JWT path.
    const dedicatedDbUrl = await tenantDbForRequest(ctx.tenantId);
    if (this.cls.isActive()) {
      this.cls.set(CLS_TENANT_ID, ctx.tenantId);
      if (dedicatedDbUrl) this.cls.set(CLS_DEDICATED_DB_URL, dedicatedDbUrl);
      if (ctx.vendorId) this.cls.set(CLS_VENDOR_ID, ctx.vendorId);
      if (ctx.vendorIdentityId) this.cls.set(CLS_VENDOR_IDENTITY_ID, ctx.vendorIdentityId);
      if (ctx.invitationId) this.cls.set(CLS_VENDOR_INVITATION_ID, ctx.invitationId);
    }
    req.tenantId = ctx.tenantId;
    req.vendorId = ctx.vendorId;
    req.vendorIdentityId = ctx.vendorIdentityId;
    req.vendorInvitationId = ctx.invitationId;
  }
}
