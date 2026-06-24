import { of } from 'rxjs';
import { TenantContextInterceptor } from '../tenant-context.interceptor';

function makeContext(req: unknown) {
  return { switchToHttp: () => ({ getRequest: () => req }) } as never;
}

describe('TenantContextInterceptor', () => {
  const interceptor = new TenantContextInterceptor();
  const next = { handle: jest.fn(() => of('ok')) };

  beforeEach(() => jest.clearAllMocks());

  it('projects the authenticated user onto the request-scoped tenant context fields', () => {
    const req: Record<string, unknown> = {
      user: {
        tenant_id: 't1',
        tenantCode: 'acme',
        user_id: 'u1',
        role: 'PROJECT_MANAGER',
        dedicatedDbUrl: 'postgres://dedicated',
      },
    };
    interceptor.intercept(makeContext(req), next as never);
    expect(req.tenantId).toBe('t1');
    expect(req.tenantCode).toBe('acme');
    expect(req.userId).toBe('u1');
    expect(req.userRole).toBe('PROJECT_MANAGER');
    expect(req.dedicatedDbUrl).toBe('postgres://dedicated');
    expect(next.handle).toHaveBeenCalledTimes(1);
  });

  it('leaves the request untouched when there is no authenticated user (unauthenticated route)', () => {
    const req: Record<string, unknown> = {};
    interceptor.intercept(makeContext(req), next as never);
    expect(req.tenantId).toBeUndefined();
    expect(next.handle).toHaveBeenCalledTimes(1);
  });
});
