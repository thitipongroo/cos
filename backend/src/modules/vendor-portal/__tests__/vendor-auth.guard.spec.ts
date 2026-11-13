// D50 (2026-11-13): the guard asks for the tenant's database after verifying its token.
const tenantDbForRequest = jest.fn();
jest.mock('../../../shared/context/tenant-db-for-request', () => ({
  tenantDbForRequest: (id: string) => tenantDbForRequest(id),
}));
beforeEach(() => tenantDbForRequest.mockReset().mockResolvedValue(null));
const DEDICATED = 'postgresql://app_user:pw@tenant-db.internal:5432/cos';

import { UnauthorizedException, ForbiddenException, ExecutionContext } from '@nestjs/common';
import { VendorAuthGuard, VendorRequest } from '../vendor-auth.guard';
import {
  CLS_DEDICATED_DB_URL,
  CLS_TENANT_ID,
  CLS_VENDOR_ID,
  CLS_VENDOR_IDENTITY_ID,
  CLS_VENDOR_INVITATION_ID,
} from '../../../shared/context/cls-context';

const TENANT = '11111111-1111-4111-8111-111111111111';

function ctxFor(req: VendorRequest): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

function build(relationship: unknown = { vendor_id: 'ven-1' }, clsActive = true) {
  const store = new Map<string, unknown>();
  const cls = { isActive: () => clsActive, set: (k: string, v: unknown) => void store.set(k, v) };
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

    it('still populates the request when no CLS context is open', async () => {
      // cls.set() throws outside an active context, so the guard checks isActive() first. That
      // branch matters on any path where the CLS middleware has not run (a test harness, or a route
      // mounted outside it): the guard must still attach tenant/vendor to the REQUEST rather than
      // failing the call — req.* is the secondary path TenantContextInterceptor reads (ADR-031).
      const { guard, store } = build({ vendor_id: 'ven-1' }, /* clsActive */ false);
      const req = { params: { token: 'THE-TOKEN' }, headers: {} } as unknown as VendorRequest;

      await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
      expect(store.size).toBe(0); // nothing written to CLS
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

describe('VendorAuthGuard — read-only trials (§7.10, ADR-109)', () => {
  function buildWith(status: string | null, flagOn = true) {
    const cls = { isActive: () => false, set: jest.fn() };
    const magicLink = {
      verifyInvitationToken: jest.fn().mockReturnValue({ tenantId: TENANT, invitationId: 'inv-1' }),
      verifySessionToken: jest.fn().mockReturnValue('vid-1'),
    };
    const identities = {
      findActiveRelationship: jest.fn().mockResolvedValue({ vendor_id: 'ven-1' }),
      tenantSubscriptionStatus: jest.fn().mockResolvedValue(status),
    };
    const flags = { isEnabled: jest.fn().mockReturnValue(flagOn) };
    const guard = new VendorAuthGuard(
      cls as never,
      magicLink as never,
      identities as never,
      flags as never,
    );
    return { guard, identities, flags };
  }
  const tier1 = (method: string) =>
    ({ method, params: { token: 'T' }, headers: {} }) as unknown as VendorRequest;
  const tier2 = (method: string) =>
    ({
      method,
      headers: { authorization: 'Bearer s', 'x-vendor-tenant-id': TENANT },
    }) as unknown as VendorRequest;

  it.each([
    ['Tier 1', tier1],
    ['Tier 2', tier2],
  ])('%s: refuses a write into an EXPIRED tenant with 403 COS-PLAN-003', async (_n, req) => {
    const { guard, flags } = buildWith('EXPIRED');
    const err = await guard.canActivate(ctxFor(req('POST'))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toEqual({
      error: expect.objectContaining({ code: 'COS-PLAN-003', messageKey: 'trial.error.readOnly' }),
    });
    expect(flags.isEnabled).toHaveBeenCalledWith('s1.tenant.trial-lifecycle', { tenantId: TENANT });
  });

  it('lets a read through without looking the tenant up', async () => {
    const { guard, identities } = buildWith('PENDING_DELETION');
    await expect(guard.canActivate(ctxFor(tier2('GET')))).resolves.toBe(true);
    expect(identities.tenantSubscriptionStatus).not.toHaveBeenCalled();
  });

  it.each(['ACTIVE', 'TRIAL', null])('lets a write through for status %s', async (status) => {
    const { guard } = buildWith(status);
    await expect(guard.canActivate(ctxFor(tier1('POST')))).resolves.toBe(true);
  });

  it('lets a write through when the flag is off, without a lookup', async () => {
    const { guard, identities } = buildWith('EXPIRED', false);
    await expect(guard.canActivate(ctxFor(tier2('PATCH')))).resolves.toBe(true);
    expect(identities.tenantSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('treats a missing flag service as off (registry default)', async () => {
    const { identities } = buildWith('EXPIRED');
    const guard = new VendorAuthGuard(
      { isActive: () => false, set: jest.fn() } as never,
      {
        verifyInvitationToken: () => ({ tenantId: TENANT, invitationId: 'i' }),
      } as never,
      identities as never,
    );
    await expect(guard.canActivate(ctxFor(tier1('POST')))).resolves.toBe(true);
  });

  describe('VendorAuthGuard — routing (D50)', () => {
    it("routes both tiers to the tenant's dedicated database", async () => {
      tenantDbForRequest.mockResolvedValue(DEDICATED);
      const invitation = build();
      await invitation.guard.canActivate(
        ctxFor({ params: { token: 'T' }, headers: {} } as unknown as VendorRequest),
      );
      expect(invitation.store.get(CLS_DEDICATED_DB_URL)).toBe(DEDICATED);

      const session = build();
      await session.guard.canActivate(
        ctxFor({
          headers: { authorization: 'Bearer S', 'x-vendor-tenant-id': TENANT },
        } as unknown as VendorRequest),
      );
      expect(session.store.get(CLS_DEDICATED_DB_URL)).toBe(DEDICATED);
      expect(tenantDbForRequest).toHaveBeenCalledWith(TENANT);
    });

    it('401 for an inactive tenant, before any tenant context is published', async () => {
      tenantDbForRequest.mockRejectedValue(new UnauthorizedException('inactive'));
      const { guard, store } = build();
      const req = { params: { token: 'T' }, headers: {} } as unknown as VendorRequest;
      await expect(guard.canActivate(ctxFor(req))).rejects.toBeInstanceOf(UnauthorizedException);
      expect(store.size).toBe(0);
      expect(req.tenantId).toBeUndefined();
    });
  });
});
