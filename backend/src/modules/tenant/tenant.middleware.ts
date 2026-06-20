// Tenant middleware — injects tenant context into every request.
// Runs after JWT guard — tenant_id comes from validated JWT claim.
// Verifies tenant is active; sets req.tenantId, req.tenantCode, req.userId, req.userRole.

import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
// @types/express added to devDeps — NestJS uses express-compatible types even with Fastify adapter
import type { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@cos/logger';

const logger = createLogger('tenant-middleware');

export interface TenantRequest extends Request {
  tenantId?: string;
  tenantCode?: string;
  userId?: string;
  userRole?: string;
  dedicatedDbUrl?: string;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly platformPrisma = new PrismaClient();

  async use(req: TenantRequest, _res: Response, next: NextFunction): Promise<void> {
    // Auth endpoints bypass tenant middleware — they run in platform schema
    const isAuthPath = req.path.startsWith('/api/v1/auth');
    const isHealthPath = req.path.startsWith('/api/v1/health');
    const isAdminPath = req.path.startsWith('/api/v1/admin');
    // Vendor Portal uses external (non-Keycloak) auth — VendorAuthMiddleware sets the context.
    const isVendorPath = req.path.startsWith('/api/v1/vendor');
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
    req.dedicatedDbUrl = tenant[0]!.dedicated_db_url ?? undefined;

    logger.debug({ tenantId: req.tenantId, userId: req.userId }, 'Tenant context injected');
    next();
  }
}
