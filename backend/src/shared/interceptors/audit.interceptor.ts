// AuditInterceptor — auto-logs all mutating operations to audit_logs.
// Runs on POST, PUT, PATCH, DELETE for all tenant-scoped endpoints.
// PII must never appear in logs — uses IDs only (QM-4, QM-8).

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  OnModuleDestroy,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../prisma/create-prisma-client';
import { appDatabaseUrl } from '../prisma/app-database-url';
import { assertSafeTenantId } from '../prisma/assert-safe-tenant-id';
import { createLogger } from '@cos/logger';
import { JwtPayload } from '../../modules/identity/jwt.payload';

const logger = createLogger('audit-interceptor');
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class AuditInterceptor implements NestInterceptor, OnModuleDestroy {
  // Write audit rows as the non-superuser app role so the audit_logs immutability actually binds to
  // the writer: RLS grants app_user INSERT/SELECT only (no UPDATE/DELETE policy = denied). A superuser
  // connection would bypass RLS and could mutate audit rows (security review L5).
  private readonly prisma = createPrismaClient(appDatabaseUrl());

  /** Close the Prisma connection on shutdown so the query-engine socket does not leak. */
  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      url?: string;
      originalUrl?: string;
      user?: JwtPayload;
      tenantId?: string;
      ip: string;
      headers: Record<string, string>;
    }>();

    if (!MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }

    const user = request.user;
    if (!user?.user_id || !request.tenantId) {
      return next.handle(); // Auth/admin endpoints — skip audit
    }

    // Fastify exposes `url` (path + query), not Express's `path`.
    const path = (request.originalUrl ?? request.url ?? '').split('?')[0];

    return next.handle().pipe(
      tap({
        next: () => {
          this.writeAuditLog({
            tenantId: request.tenantId!,
            actorId: user.user_id,
            action: `${request.method} ${path}`,
            resourceType: this.extractResourceType(path),
            // @pdpa: ip_address is stored in audit_logs only (operational necessity)
            ipAddress: request.ip,
          }).catch((err) =>
            logger.error({ err, actorId: user.user_id }, 'Failed to write audit log'),
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
    assertSafeTenantId(entry.tenantId);
    // app_user's INSERT policy has WITH CHECK (tenant_id = app.current_tenant_id), so the GUC must be
    // set in the same transaction as the INSERT (transaction-scoped SET LOCAL — safe under PgBouncer).
    await this.prisma.$transaction(async (tx) => {
      await (tx as PrismaClient).$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${entry.tenantId}'`,
      );
      await tx.$executeRaw`
        INSERT INTO platform.audit_logs (tenant_id, actor_id, action, resource_type, ip_address)
        VALUES (
          ${entry.tenantId}::uuid,
          ${entry.actorId}::uuid,
          ${entry.action},
          ${entry.resourceType},
          ${entry.ipAddress ?? null}::inet
        )
      `;
    });
  }

  private extractResourceType(path: string): string {
    // e.g. /api/v1/projects/uuid/boq → "projects"
    const segments = path.replace(/^\/api\/v\d+\//, '').split('/');
    return segments[0] ?? /* istanbul ignore next */ 'unknown';
  }
}
