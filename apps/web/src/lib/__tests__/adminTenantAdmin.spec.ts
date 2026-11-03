import { ADMIN_INVITE_HOURS, tenantAdminAction, tenantAdminErrorKey } from '../adminTenantAdmin';
import { FLAG_FALLBACKS, FLAG_TENANT_BOOTSTRAP_ADMIN, isFlagEnabled } from '../flags';

const row = (
  over: Partial<{
    is_active: boolean;
    tenant_admin_count: number;
    tenant_admin_pending: boolean;
  }> = {},
) => ({
  is_active: true,
  tenant_admin_count: 0,
  tenant_admin_pending: false,
  ...over,
});

describe('tenantAdminAction (ADR-110)', () => {
  it('offers create for an active tenant with no administrator', () => {
    expect(tenantAdminAction(row(), true)).toBe('create');
  });

  it('offers resend while the only administrator has never signed in', () => {
    expect(
      tenantAdminAction(row({ tenant_admin_count: 1, tenant_admin_pending: true }), true),
    ).toBe('resend');
  });

  it('offers nothing once the administrator has signed in', () => {
    expect(tenantAdminAction(row({ tenant_admin_count: 1 }), true)).toBeNull();
  });

  it('offers nothing for a deactivated tenant', () => {
    expect(tenantAdminAction(row({ is_active: false }), true)).toBeNull();
  });

  it('offers nothing while the flag is off', () => {
    expect(tenantAdminAction(row(), false)).toBeNull();
  });
});

describe('tenantAdminErrorKey', () => {
  it.each([
    [{ status: 409, code: 'COS-TADM-001' }, 'admin.tenantAdmin.error.alreadyHasAdmin'],
    [{ status: 409, code: 'COS-TADM-002' }, 'admin.tenantAdmin.error.notResendable'],
    [{ status: 409, code: 'COS-TADM-003' }, 'admin.tenantAdmin.error.notCancellable'],
    [{ status: 503, code: 'COS-FLAG-001' }, 'admin.tenantAdmin.error.disabled'],
    [{ status: 503, code: 'COS-GENERAL-503' }, 'admin.tenantAdmin.error.disabled'],
    [{ status: 409 }, 'admin.tenantAdmin.error.emailTaken'],
    [{ status: 404 }, 'admin.errors.notFound'],
    [{ status: 400 }, 'admin.errors.invalid'],
    [null, 'admin.errors.generic'],
    [undefined, 'admin.errors.generic'],
  ])('%j → %s', (error, key) => {
    expect(tenantAdminErrorKey(error)).toBe(key);
  });
});

describe('flag and lifespan', () => {
  it('is fail-closed when the flag endpoint has not answered', () => {
    expect(FLAG_FALLBACKS[FLAG_TENANT_BOOTSTRAP_ADMIN]).toBe(false);
    expect(isFlagEnabled(undefined, FLAG_TENANT_BOOTSTRAP_ADMIN)).toBe(false);
    expect(
      isFlagEnabled({ [FLAG_TENANT_BOOTSTRAP_ADMIN]: true }, FLAG_TENANT_BOOTSTRAP_ADMIN),
    ).toBe(true);
  });

  it('matches the server invitation lifespan (72 hours)', () => {
    expect(ADMIN_INVITE_HOURS).toBe(72);
  });
});
