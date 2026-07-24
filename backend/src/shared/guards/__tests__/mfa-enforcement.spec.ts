// Unit tests — enforceMfaForPrivilegedRoles (Layer 2 MFA gate).
// Covers: non-privileged pass-through, accepted acr, disabled-enforcement WARN path, enabled-enforcement
// throw, and the MFA_REQUIRED_ACR override.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { ForbiddenException } from '@nestjs/common';
import { enforceMfaForPrivilegedRoles, MFA_REQUIRED_ROLES } from '../mfa-enforcement';

describe('enforceMfaForPrivilegedRoles', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('exposes TENANT_ADMIN and FINANCE as the MFA-required roles', () => {
    expect([...MFA_REQUIRED_ROLES].sort()).toEqual(['FINANCE', 'TENANT_ADMIN']);
  });

  it('is a no-op for a non-privileged role regardless of acr', () => {
    process.env['MFA_ENFORCE'] = 'true';
    expect(() =>
      enforceMfaForPrivilegedRoles({ role: 'SITE_WORKER', user_id: 'u1' }),
    ).not.toThrow();
  });

  it('passes a privileged role whose acr proves OTP (default accepted value "gold")', () => {
    process.env['MFA_ENFORCE'] = 'true';
    expect(() =>
      enforceMfaForPrivilegedRoles({ role: 'TENANT_ADMIN', acr: 'gold', user_id: 'u1' }),
    ).not.toThrow();
  });

  it('throws COS-AUTH-001 for a privileged role without MFA acr when enforcement is ON', () => {
    process.env['MFA_ENFORCE'] = 'true';
    try {
      enforceMfaForPrivilegedRoles({ role: 'FINANCE', acr: 'copper', user_id: 'u1' });
      throw new Error('expected ForbiddenException');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getResponse()).toMatchObject({ code: 'COS-AUTH-001' });
    }
  });

  it('throws when the privileged token carries no acr at all (enforcement ON)', () => {
    process.env['MFA_ENFORCE'] = 'true';
    expect(() => enforceMfaForPrivilegedRoles({ role: 'TENANT_ADMIN', user_id: 'u1' })).toThrow(
      ForbiddenException,
    );
  });

  it('logs a shortfall but does NOT throw while enforcement is OFF (default)', () => {
    delete process.env['MFA_ENFORCE'];
    // acr present-but-wrong AND acr absent both take the disabled path without throwing.
    expect(() =>
      enforceMfaForPrivilegedRoles({ role: 'TENANT_ADMIN', acr: 'copper', user_id: 'u1' }),
    ).not.toThrow();
    expect(() => enforceMfaForPrivilegedRoles({ role: 'FINANCE', user_id: 'u2' })).not.toThrow();
  });

  it('honors MFA_REQUIRED_ACR override (comma-separated accepted values)', () => {
    process.env['MFA_ENFORCE'] = 'true';
    process.env['MFA_REQUIRED_ACR'] = 'silver, gold';
    expect(() =>
      enforceMfaForPrivilegedRoles({ role: 'FINANCE', acr: 'silver', user_id: 'u1' }),
    ).not.toThrow();
    expect(() =>
      enforceMfaForPrivilegedRoles({ role: 'FINANCE', acr: 'bronze', user_id: 'u1' }),
    ).toThrow(ForbiddenException);
  });
});
