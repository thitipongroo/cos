// ContractSignTokenGuard — authenticates an external client signing a contract via magic-link (ADR-058
// CT-5). The client has no Keycloak JWT, so — like JwtAuthGuard — this guard publishes the tenant context
// into CLS (read by TenantPrismaService for RLS and by CredentialClientService), and sets req.tenantId.
// A guard (not middleware) is used because the global ClsModule middleware has already opened the CLS
// context by the time guards run, so cls.set() reliably persists (Fastify clones the request object).

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { CLS_TENANT_ID, CLS_USER_ID, CLS_USER_ROLE } from '../../shared/context/cls-context';
import { ContractSignLinkService } from './contract-sign-link.service';

interface SignRequest {
  params?: { token?: string };
  tenantId?: string;
  contractId?: string;
}

@Injectable()
export class ContractSignTokenGuard implements CanActivate {
  constructor(
    private readonly cls: ClsService,
    private readonly signLink: ContractSignLinkService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<SignRequest>();
    const token = req.params?.token;
    if (!token) {
      throw new UnauthorizedException('Missing sign token');
    }
    const claims = await this.signLink.verify(token); // throws on bad signature / expiry

    if (this.cls.isActive()) {
      this.cls.set(CLS_TENANT_ID, claims.tenantId);
      // The client is not a platform user; attribute VC issuance to a contract-scoped client URN.
      this.cls.set(CLS_USER_ID, `urn:cos:contract-client:${claims.contractId}`);
      this.cls.set(CLS_USER_ROLE, 'CONTRACT_CLIENT');
    }
    req.tenantId = claims.tenantId;
    req.contractId = claims.contractId;
    return true;
  }
}
