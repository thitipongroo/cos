import { UnauthorizedException, ForbiddenException, ExecutionContext } from '@nestjs/common';
import { VendorAuthGuard, VendorRequest } from '../vendor-auth.guard';
import {
  CLS_TENANT_ID,
  CLS_VENDOR_ID,
  CLS_VENDOR_IDENTITY_ID,
  CLS_VENDOR_INVITATION_ID,
} from '../../../shared/context/cls-context';

const TENANT = '11111111-1111-4111-8111-111111111111';

function ctxFor(req: VendorRequest): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

function build(relationship: unknown = { vendor_id: 'ven-1' }) {
  const store = new Map<string, unknown>();
  const cls = { isActive: () => true, set: (k: string, v: unknown) => void store.set(k, v) };
  const magicLink = {
    verifyInvitationToken: jest.fn().mockReturnValue({ tenantId: TENANT, invitationId: 'inv-1' }),
    verifySessionToken: jest.fn().mockReturnValue('vid-1'),
  };
  const identities = { findActiveRelationship: jest.fn().mockResolvedValue(relationship) };
  const guard = new VendorAuthGuard(cls as never, magicLink as never, identities as never);
  return { guard, magicLink, identities, store };
}

describe('VendorAuthGuard', () => {
  describe('Tier 1 — invitation magic-link', () => {
    it('publishes tenant + invitation from the :token route param, into CLS and the request', async () => {
      const { guard, magicLink, store } = build();
      const req = { params: { token: 'THE-TOKEN' }, headers: {} } as unknown as VendorRequest;

      await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);

      expect(magicLink.verifyInvitationToken).toHaveBeenCalledWith('THE-TOKEN');
      // CLS is what TenantPrismaService actually reads — the whole point of the guard.
      expect(store.get(CLS_TENANT_ID)).toBe(TENANT);
      expect(store.get(CLS_VENDOR_INVITATION_ID)).toBe('inv-1');
      expect(req.tenantId).toBe(TENANT);
      expect(req.vendorInvitationId).toBe('inv-1');
    });

    it('rejects a token carrying a non-UUID tenant before it can reach SET LOCAL', async () => {
      const { guard, magicLink } = build();
      magicLink.verifyInvitationToken.mockReturnValue({
        tenantId: "' OR 1=1--",
        invitationId: 'inv-1',
      });
      const req = { params: { token: 'THE-TOKEN' }, headers: {} } as unknown as VendorRequest;

      await expect(guard.canActivate(ctxFor(req))).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Tier selection', () => {
    // Which tier applies is decided by the route table (presence of the :token param), not by
    // matching a caller-supplied URL — so a crafted path cannot select the weaker tier.
    // Supersedes the anchored-regex fix for CodeQL js/user-controlled-bypass.
    it('takes Tier-2 when there is no :token route param, whatever the URL looks like', async () => {
      const { guard, magicLink } = build();
      const req = {
        params: {},
        url: '/api/v1/vendor/invoices/vendor/rfq/THE-TOKEN',
        headers: {},
      } as unknown as VendorRequest;

      // Falls through to Tier-2, which rejects because there is no Bearer token.
      await expect(guard.canActivate(ctxFor(req))).rejects.toThrow(UnauthorizedException);
      expect(magicLink.verifyInvitationToken).not.toHaveBeenCalled();
    });
  });

  describe('Tier 2 — vendor session', () => {
    it('rejects a missing Bearer token', async () => {
      const { guard } = build();
      const req = { params: {}, headers: {} } as unknown as VendorRequest;
      await expect(guard.canActivate(ctxFor(req))).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a missing x-vendor-tenant-id header', async () => {
      const { guard } = build();
      const req = {
        params: {},
        headers: { authorization: 'Bearer sess' },
      } as unknown as VendorRequest;
      await expect(guard.canActivate(ctxFor(req))).rejects.toThrow('x-vendor-tenant-id');
    });

    it('rejects a non-UUID x-vendor-tenant-id header', async () => {
      const { guard, identities } = build();
      const req = {
        params: {},
        headers: { authorization: 'Bearer sess', 'x-vendor-tenant-id': "' OR 1=1--" },
      } as unknown as VendorRequest;

      await expect(guard.canActivate(ctxFor(req))).rejects.toThrow(UnauthorizedException);
      expect(identities.findActiveRelationship).not.toHaveBeenCalled();
    });

    it('rejects when there is no active trading relationship', async () => {
      const { guard } = build(null);
      const req = {
        params: {},
        headers: { authorization: 'Bearer sess', 'x-vendor-tenant-id': TENANT },
      } as unknown as VendorRequest;
      await expect(guard.canActivate(ctxFor(req))).rejects.toThrow(ForbiddenException);
    });

    it('publishes tenant + vendor into CLS and the request on success', async () => {
      const { guard, identities, store } = build();
      const req = {
        params: {},
        headers: { authorization: 'Bearer sess', 'x-vendor-tenant-id': TENANT },
      } as unknown as VendorRequest;

      await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);

      expect(identities.findActiveRelationship).toHaveBeenCalledWith('vid-1', TENANT);
      expect(store.get(CLS_TENANT_ID)).toBe(TENANT);
      expect(store.get(CLS_VENDOR_ID)).toBe('ven-1');
      expect(store.get(CLS_VENDOR_IDENTITY_ID)).toBe('vid-1');
      expect(req.tenantId).toBe(TENANT);
      expect(req.vendorId).toBe('ven-1');
      expect(req.vendorIdentityId).toBe('vid-1');
    });
  });
});
