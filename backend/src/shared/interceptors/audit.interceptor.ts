// AuditInterceptor — auto-logs all mutating operations to audit_logs.
// Runs on POST, PUT, PATCH, DELETE for all tenant-scoped endpoints.
// PII must never appear in logs — uses IDs only (QM-4, QM-8).

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@cos/logger';
import { JwtPayload } from '../../modules/identity/jwt.payload';

const logger = createLogger('audit-interceptor');
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly prisma = new PrismaClient();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      path: string;
      user?: JwtPayload;
      tenantId?: string;
      ip: string;
      headers: Record<string, string>;
    }>();

    if (!MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }

    const user = request.user;
    if (!user?.cos_user_id || !request.tenantId) {
      return next.handle(); // Auth/admin endpoints — skip audit
    }

    return next.handle().pipe(
      tap({
        next: () => {
          this.writeAuditLog({
            tenantId: request.tenantId!,
            actorId: user.cos_user_id,
            action: `${request.method} ${request.path}`,
            resourceType: this.extractResourceType(request.path),
            // @pdpa: ip_address is stored in audit_logs only (operational necessity)
            ipAddress: request.ip,
          }).catch((err) =>
            logger.error({ err, actorId: user.cos_user_id }, 'Failed to write audit log'),
          );
        },
      }),
    );
  }

  private async writeAuditLog(entry: {
    tenantId: string;
    actorId: string;
    action: string;
    resourceType: string;
    ipAddress?: string;
  }): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO platform.audit_logs (tenant_id, actor_id, action, resource_type, ip_address)
      VALUES (
        ${entry.tenantId}::uuid,
        ${entry.actorId}::uuid,
        ${entry.action},
        ${entry.resourceType},
        ${entry.ipAddress ?? null}::inet
      )
    `;
  }

  private extractResourceType(path: string): string {
    // e.g. /api/v1/projects/uuid/boq → "projects"
    const segments = path.replace(/^\/api\/v\d+\//, '').split('/');
    return segments[0] ?? /* istanbul ignore next */ 'unknown';
  }
}
