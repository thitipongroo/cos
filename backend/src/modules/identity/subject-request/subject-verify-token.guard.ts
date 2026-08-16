// SubjectVerifyTokenGuard — authenticates a data subject confirming a verification link (ADR-090 §6).
//
// The person on the other end has no Keycloak JWT and no account at all, so — exactly as
// ContractSignTokenGuard does for ADR-058 — this guard takes the tenant from the token's own signed
// claim and publishes it into CLS, which is what TenantPrismaService reads for RLS. The token IS the
// tenant context; nothing here runs unscoped.
//
// A guard rather than middleware: the global ClsModule middleware has already opened the CLS context
// by the time guards run, so `cls.set()` persists (Fastify clones the request object).

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { CLS_TENANT_ID, CLS_USER_ID, CLS_USER_ROLE } from '../../../shared/context/cls-context';
import { SubjectVerificationService } from './subject-verification.service';

interface VerifyRequest {
  params?: { token?: string };
  tenantId?: string;
  subjectRequestId?: string;
}

@Injectable()
export class SubjectVerifyTokenGuard implements CanActivate {
  constructor(
    private readonly cls: ClsService,
    private readonly verification: SubjectVerificationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<VerifyRequest>();
    const token = req.params?.token;
    if (!token) {
      throw new UnauthorizedException('Missing verification token');
    }
    const claims = await this.verification.verify(token); // throws on bad signature / expiry

    if (this.cls.isActive()) {
      this.cls.set(CLS_TENANT_ID, claims.tenantId);
      // The subject is not a platform user and must never be attributed as one. A request-scoped URN
      // keeps the audit trail honest about who acted: the person the request is about, not an admin.
      this.cls.set(CLS_USER_ID, `urn:cos:data-subject:${claims.requestId}`);
      this.cls.set(CLS_USER_ROLE, 'DATA_SUBJECT');
    }
    req.tenantId = claims.tenantId;
    req.subjectRequestId = claims.requestId;
    return true;
  }
}
