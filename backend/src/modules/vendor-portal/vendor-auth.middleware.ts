// VendorAuthMiddleware — external Vendor Portal authentication (ADR-030, §05 §5.4.3).
//
// Runs on /api/v1/vendor/* (which TenantMiddleware bypasses — vendors have no Keycloak JWT). It
// resolves the request's tenant + vendor context so the downstream request-scoped repositories work:
//   - Tier 1 (/vendor/rfq/:token...): verify the invitation token (signature + expiry), set
//     req.tenantId + req.vendorInvitationId. The single-use / token_hash / status check happens in
//     the service (it needs tenant-scoped DB access, available only after tenantId is set here).
//   - Tier 2 (Bearer session + x-vendor-tenant-id header): verify the session token, then confirm an
//     ACTIVE trading relationship for that vendor in that tenant; set req.tenantId + req.vendorId.

import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { MagicLinkService } from './magic-link.service';
import { VendorIdentityRepository } from './vendor-identity.repository';

export interface VendorRequest extends Request {
  tenantId?: string;
  vendorId?: string;
  vendorIdentityId?: string;
  vendorInvitationId?: string;
}

const RFQ_TOKEN_PATTERN = /\/vendor\/rfq\/([^/]+)/;

@Injectable()
export class VendorAuthMiddleware implements NestMiddleware {
  constructor(
    private readonly magicLink: MagicLinkService,
    private readonly identities: VendorIdentityRepository,
  ) {}

  async use(req: VendorRequest, _res: Response, next: NextFunction): Promise<void> {
    const tokenMatch = RFQ_TOKEN_PATTERN.exec(req.path);
    if (tokenMatch) {
      // ── Tier 1: invitation magic-link ──
      const claims = this.magicLink.verifyInvitationToken(decodeURIComponent(tokenMatch[1]));
      req.tenantId = claims.tenantId;
      req.vendorInvitationId = claims.invitationId;
      return next();
    }

    // ── Tier 2: vendor session ──
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing vendor session token');
    }
    const vendorIdentityId = this.magicLink.verifySessionToken(auth.slice(7));

    const tenantId = req.headers['x-vendor-tenant-id'];
    if (typeof tenantId !== 'string' || !tenantId) {
      throw new UnauthorizedException('Missing x-vendor-tenant-id header');
    }

    const relationship = await this.identities.findActiveRelationship(vendorIdentityId, tenantId);
    if (!relationship) {
      throw new ForbiddenException('No active trading relationship with this tenant');
    }

    req.tenantId = tenantId;
    req.vendorIdentityId = vendorIdentityId;
    req.vendorId = relationship.vendor_id;
    next();
  }
}
