import { UnauthorizedException } from '@nestjs/common';

// tenant_id is interpolated into `SET LOCAL app.current_tenant_id = '<id>'` — PostgreSQL configuration
// parameters cannot be bound as query parameters, so the value MUST be validated as a UUID before
// interpolation to prevent SQL injection (QM-4). Single source of truth: every path that opens a
// tenant transaction (TenantPrismaService, NotificationPrismaService, Temporal activity helpers)
// validates through this function — a divergence between copies would be a tenant-isolation bug.
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertSafeTenantId(id: string): void {
  if (!UUID_PATTERN.test(id)) {
    throw new UnauthorizedException(`Invalid tenant_id format: ${id}`);
  }
}
