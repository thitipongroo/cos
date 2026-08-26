// Tenant middleware — injects tenant context into every request.
// Runs after JWT guard — tenant_id comes from validated JWT claim.
// Verifies tenant is active; sets req.tenantId, req.tenantCode, req.userId, req.userRole.

import { Injectable, NestMiddleware, UnauthorizedException, OnModuleDestroy } from '@nestjs/common';
// @types/express added to devDeps — NestJS uses express-compatible types even with Fastify adapter
import type { Response, NextFunction } from 'express';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { createLogger } from '@cos/logger';
import { decryptDedicatedDbUrl } from '../../shared/crypto/dedicated-db-url-cipher';

const logger = createLogger('tenant-middleware');

// Re-exported so this module's own files keep their existing import, and so a reader landing on the
// middleware still finds the shape it sets. The definition moved to shared/context on 2026-08-26 —
// an interface cannot appear in a NestJS `exports:` array, so importing it from here was a
// cross-module reach past the public API for every consumer outside this module (master:1608).
import type { TenantRequest } from '../../shared/context/tenant-request';
export type { TenantRequest };

@Injectable()
export class TenantMiddleware implements NestMiddleware, OnModuleDestroy {
  private readonly platformPrisma = createPrismaClient();

  /** Close the Prisma connection on shutdown so the query-engine socket does not leak. */
  async onModuleDestroy(): Promise<void> {
    await this.platformPrisma.$disconnect();
  }

  async use(req: TenantRequest, _res: Response, next: NextFunction): Promise<void> {
    // Under the Fastify adapter, NestJS middleware runs via @fastify/middie where `req`
    // is the raw Node IncomingMessage: it exposes `.url` (path + query) but NOT Express's
    // `.path`. Derive the path from whichever is present so this works under both adapters.
    const path = ((req as { originalUrl?: string }).originalUrl ?? req.url ?? '').split('?')[0];

    // Auth endpoints bypass tenant middleware — they run in platform schema
    const isAuthPath = path.startsWith('/api/v1/auth');
    const isHealthPath = path.startsWith('/api/v1/health');
    const isAdminPath = path.startsWith('/api/v1/admin');
    // Vendor Portal uses external (non-Keycloak) auth — VendorAuthGuard sets the context.
    const isVendorPath = path.startsWith('/api/v1/vendor');
    if (isAuthPath || isHealthPath || isAdminPath || isVendorPath) {
      return next();
    }

    // JWT payload injected by Keycloak strategy before this middleware.
    // Claim names: tenant_id, user_id, role — per spec §5.4.1.
    const jwtPayload = (
      req as unknown as { user?: { tenant_id: string; user_id: string; role: string } }
    ).user;
    if (!jwtPayload?.tenant_id) {
      throw new UnauthorizedException('Missing tenant context in JWT');
    }

    // Verify tenant exists and is active (security check — also fetches tenant_code for audit logs)
    const tenant = await this.platformPrisma.$queryRaw<
      Array<{ tenant_code: string; dedicated_db_url: string | null }>
    >`
      SELECT tenant_code, dedicated_db_url FROM platform.tenants
      WHERE tenant_id = ${jwtPayload.tenant_id}::uuid
        AND is_active = true
      LIMIT 1
    `;

    if (!tenant.length) {
      logger.warn({ tenantId: jwtPayload.tenant_id }, 'Tenant not found or inactive');
      throw new UnauthorizedException('Tenant not found or inactive');
    }

    req.tenantId = jwtPayload.tenant_id;
    req.tenantCode = tenant[0]!.tenant_code;
    req.userId = jwtPayload.user_id;
    req.userRole = jwtPayload.role;
    // Accepts ciphertext or legacy plaintext (security review F5b) — kept correct even though this
    // middleware is no longer mounted (tenant.module.ts), so reviving it cannot resurrect the bug.
    req.dedicatedDbUrl = tenant[0]!.dedicated_db_url
      ? decryptDedicatedDbUrl(tenant[0]!.dedicated_db_url)
      : undefined;

    logger.debug({ tenantId: req.tenantId, userId: req.userId }, 'Tenant context injected');
    next();
  }
}
