// Tenant middleware — injects tenant context into every request.
// Runs after JWT guard — tenant_id comes from validated JWT claim.
// Sets req.tenantCode from the tenant record for TenantPrismaService.

import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@cos/logger';

const logger = createLogger('tenant-middleware');

export interface TenantRequest extends Request {
  tenantId?: string;
  tenantCode?: string;
  userId?: string;
  userRole?: string;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly platformPrisma = new PrismaClient();

  async use(req: TenantRequest, _res: Response, next: NextFunction): Promise<void> {
    // Auth endpoints bypass tenant middleware — they run in platform schema
    const isAuthPath = req.path.startsWith('/api/v1/auth');
    const isHealthPath = req.path.startsWith('/api/v1/health');
    const isAdminPath = req.path.startsWith('/api/v1/admin');
    if (isAuthPath || isHealthPath || isAdminPath) {
      return next();
    }

    // JWT payload injected by Keycloak strategy before this middleware
    const jwtPayload = (req as unknown as { user?: { tenantId: string; userId: string; role: string } }).user;
    if (!jwtPayload?.tenantId) {
      throw new UnauthorizedException('Missing tenant context in JWT');
    }

    // Look up tenantCode — needed to set search_path
    const tenant = await this.platformPrisma.$queryRaw<Array<{ tenant_code: string }>>`
      SELECT tenant_code FROM platform.tenants
      WHERE tenant_id = ${jwtPayload.tenantId}::uuid
        AND is_active = true
      LIMIT 1
    `;

    if (!tenant.length) {
      logger.warn({ tenantId: jwtPayload.tenantId }, 'Tenant not found or inactive');
      throw new UnauthorizedException('Tenant not found or inactive');
    }

    req.tenantId = jwtPayload.tenantId;
    req.tenantCode = tenant[0]!.tenant_code;
    req.userId = jwtPayload.userId;
    req.userRole = jwtPayload.role;

    logger.debug({ tenantCode: req.tenantCode, userId: req.userId }, 'Tenant context injected');
    next();
  }
}
