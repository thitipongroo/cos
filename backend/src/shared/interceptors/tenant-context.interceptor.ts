// TenantContextInterceptor — projects the authenticated user (req.user, set by
// KeycloakJwtStrategy during JwtAuthGuard) onto the request-scoped tenant context fields
// (req.tenantId / tenantCode / userId / userRole / dedicatedDbUrl) that controllers and
// services read. Runs after guards, before the route handler, so req.user is always present
// on authenticated routes. Unauthenticated routes (no JwtAuthGuard) have no req.user and are
// left untouched — matching the previous middleware's bypass behaviour.

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthenticatedUser } from '../../modules/identity/strategies/keycloak-jwt.strategy';
import type { TenantRequest } from '../context/tenant-request';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<TenantRequest & { user?: AuthenticatedUser }>();
    const user = req.user;
    if (user?.tenant_id) {
      req.tenantId = user.tenant_id;
      req.tenantCode = user.tenantCode;
      req.userId = user.user_id;
      req.userRole = user.role;
      req.dedicatedDbUrl = user.dedicatedDbUrl;
    }
    return next.handle();
  }
}
