// Unit tests — assertSafeTenantId(): the single UUID guard that every tenant-transaction path uses
// before interpolating tenant_id into `SET LOCAL app.current_tenant_id` (QM-4, injection prevention).

import { UnauthorizedException } from '@nestjs/common';
import { assertSafeTenantId, UUID_PATTERN } from '../assert-safe-tenant-id';

describe('assertSafeTenantId', () => {
  it('accepts a valid lowercase UUID', () => {
    expect(() => assertSafeTenantId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).not.toThrow();
  });

  it('accepts a valid uppercase-hex UUID', () => {
    expect(() => assertSafeTenantId('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).not.toThrow();
  });

  it('throws UnauthorizedException for a non-UUID (tenant-code) value', () => {
    expect(() => assertSafeTenantId('acme_corp')).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException for a SQL-injection attempt', () => {
    expect(() => assertSafeTenantId("x'; DROP TABLE platform.tenants; --")).toThrow(
      UnauthorizedException,
    );
  });

  it('exports a UUID pattern anchored end-to-end', () => {
    expect(UUID_PATTERN.test('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
    expect(UUID_PATTERN.test('a1b2c3d4-e5f6-7890-abcd-ef1234567890 OR 1=1')).toBe(false);
  });
});
