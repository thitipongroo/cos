import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { VendorAuthMiddleware, VendorRequest } from '../vendor-auth.middleware';

function build(relationship: unknown = { vendor_id: 'ven-1' }) {
  const magicLink = {
    verifyInvitationToken: jest.fn().mockReturnValue({ tenantId: 'ten-1', invitationId: 'inv-1' }),
    verifySessionToken: jest.fn().mockReturnValue('vid-1'),
  };
  const identities = { findActiveRelationship: jest.fn().mockResolvedValue(relationship) };
  const mw = new VendorAuthMiddleware(magicLink as never, identities as never);
  return { mw, magicLink, identities };
}

describe('VendorAuthMiddleware', () => {
  it('Tier-1: sets tenant + invitation context from the path token', async () => {
    const { mw, magicLink } = build();
    const req = { path: '/api/v1/vendor/rfq/THE-TOKEN', headers: {} } as unknown as VendorRequest;
    const next = jest.fn();
    await mw.use(req, {} as never, next);
    expect(magicLink.verifyInvitationToken).toHaveBeenCalledWith('THE-TOKEN');
    expect(req.tenantId).toBe('ten-1');
    expect(req.vendorInvitationId).toBe('inv-1');
    expect(next).toHaveBeenCalled();
  });

  // Which tier runs is decided from req.path, which the caller controls. The pattern is anchored to
  // the two real Tier-1 routes so a crafted URL cannot pick the weaker one; before that it matched
  // /vendor/rfq/<token> anywhere in the path. CodeQL js/user-controlled-bypass.
  it.each([
    [
      'a Tier-2 path with the Tier-1 route appended',
      '/api/v1/vendor/invoices/vendor/rfq/THE-TOKEN',
    ],
    ['the Tier-1 route as a prefix of something else', '/api/v1/vendor/rfq/THE-TOKEN/extra/path'],
    ['the Tier-1 route nested mid-path', '/api/v1/vendor/purchase-orders/vendor/rfq/THE-TOKEN'],
    ['a path missing the api prefix', '/vendor/rfq/THE-TOKEN'],
  ])('does not take Tier-1 for %s', async (_label, path) => {
    const { mw, magicLink } = build();
    const req = { path, headers: {} } as unknown as VendorRequest;

    // Falls through to Tier-2, which rejects because there is no Bearer token.
    await expect(mw.use(req, {} as never, jest.fn())).rejects.toThrow(UnauthorizedException);
    expect(magicLink.verifyInvitationToken).not.toHaveBeenCalled();
  });

  it('Tier-1 still covers the quotation sub-route', async () => {
    const { mw, magicLink } = build();
    const req = {
      path: '/api/v1/vendor/rfq/THE-TOKEN/quotation',
      headers: {},
    } as unknown as VendorRequest;
    const next = jest.fn();

    await mw.use(req, {} as never, next);

    expect(magicLink.verifyInvitationToken).toHaveBeenCalledWith('THE-TOKEN');
    expect(next).toHaveBeenCalled();
  });

  it('Tier-2: rejects a missing Bearer token', async () => {
    const { mw } = build();
    const req = { path: '/api/v1/vendor/purchase-orders', headers: {} } as unknown as VendorRequest;
    await expect(mw.use(req, {} as never, jest.fn())).rejects.toThrow(UnauthorizedException);
  });

  it('Tier-2: rejects a missing x-vendor-tenant-id header', async () => {
    const { mw } = build();
    const req = {
      path: '/api/v1/vendor/invoices',
      headers: { authorization: 'Bearer sess' },
    } as unknown as VendorRequest;
    await expect(mw.use(req, {} as never, jest.fn())).rejects.toThrow('x-vendor-tenant-id');
  });

  it('Tier-2: rejects when no active trading relationship', async () => {
    const { mw } = build(null);
    const req = {
      path: '/api/v1/vendor/invoices',
      headers: { authorization: 'Bearer sess', 'x-vendor-tenant-id': 'ten-1' },
    } as unknown as VendorRequest;
    await expect(mw.use(req, {} as never, jest.fn())).rejects.toThrow(ForbiddenException);
  });

  it('Tier-2: sets tenant + vendor context on success', async () => {
    const { mw, identities } = build();
    const req = {
      path: '/api/v1/vendor/invoices',
      headers: { authorization: 'Bearer sess', 'x-vendor-tenant-id': 'ten-1' },
    } as unknown as VendorRequest;
    const next = jest.fn();
    await mw.use(req, {} as never, next);
    expect(identities.findActiveRelationship).toHaveBeenCalledWith('vid-1', 'ten-1');
    expect(req.tenantId).toBe('ten-1');
    expect(req.vendorId).toBe('ven-1');
    expect(req.vendorIdentityId).toBe('vid-1');
    expect(next).toHaveBeenCalled();
  });
});
