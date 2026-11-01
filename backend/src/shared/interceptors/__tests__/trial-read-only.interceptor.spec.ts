// TrialReadOnlyInterceptor — an ended free trial may read but not write (§7.10, ADR-109).

import { ForbiddenException, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import {
  ALLOW_WHILE_READ_ONLY_KEY,
  AllowWhileReadOnly,
  TRIAL_LIFECYCLE_FLAG,
  TrialReadOnlyInterceptor,
} from '../trial-read-only.interceptor';
import { IdentityController } from '../../../modules/identity/identity.controller';
import { ConsentController } from '../../../modules/identity/consent/consent.controller';
import { DataExportController } from '../../../modules/identity/data-export/data-export.controller';
import { DEFAULT_FLAGS } from '../../feature-flags/feature-flag.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

function ctx(
  method: string,
  subscriptionStatus: string | undefined,
  opts: { type?: string; handler?: () => void; cls?: object; noUser?: boolean } = {},
): ExecutionContext {
  const req = {
    method,
    user: opts.noUser ? undefined : { tenant_id: TENANT, user_id: USER, subscriptionStatus },
  };
  return {
    getType: () => opts.type ?? 'http',
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => opts.handler ?? (() => undefined),
    getClass: () => opts.cls ?? class {},
  } as unknown as ExecutionContext;
}

describe('TrialReadOnlyInterceptor', () => {
  let flags: { isEnabled: jest.Mock };
  let interceptor: TrialReadOnlyInterceptor;
  let next: CallHandler & { handle: jest.Mock };

  beforeEach(() => {
    flags = { isEnabled: jest.fn().mockReturnValue(true) };
    interceptor = new TrialReadOnlyInterceptor(new Reflector(), flags as never);
    next = { handle: jest.fn().mockReturnValue(of('ok')) };
  });

  const passes = (c: ExecutionContext) => {
    interceptor.intercept(c, next);
    expect(next.handle).toHaveBeenCalledTimes(1);
  };

  it.each(['EXPIRED', 'PENDING_DELETION'])(
    'refuses a write while %s with 403 COS-PLAN-003',
    (status) => {
      let thrown: unknown;
      try {
        interceptor.intercept(ctx('POST', status), next);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(ForbiddenException);
      expect((thrown as ForbiddenException).getResponse()).toEqual({
        error: {
          code: 'COS-PLAN-003',
          message: 'Your free trial has ended. The account is read-only until a plan is chosen.',
          messageKey: 'trial.error.readOnly',
          details: { subscription_status: status },
        },
      });
      expect(next.handle).not.toHaveBeenCalled();
      expect(flags.isEnabled).toHaveBeenCalledWith(TRIAL_LIFECYCLE_FLAG, {
        tenantId: TENANT,
        userId: USER,
      });
    },
  );

  it.each(['PUT', 'PATCH', 'DELETE', 'patch'])('refuses %s as well', (method) => {
    expect(() => interceptor.intercept(ctx(method, 'EXPIRED'), next)).toThrow(ForbiddenException);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'lets %s through — reading and exporting stay open',
    (method) => {
      passes(ctx(method, 'EXPIRED'));
    },
  );

  it.each(['ACTIVE', 'TRIAL', undefined])('lets a write through for status %s', (status) => {
    passes(ctx('POST', status));
  });

  it('lets an unauthenticated request through untouched', () => {
    passes(ctx('POST', undefined, { noUser: true }));
  });

  it('treats a request with no method as a write', () => {
    const c = ctx('POST', 'EXPIRED');
    (c.switchToHttp().getRequest() as { method?: string }).method = undefined;
    expect(() => interceptor.intercept(c, next)).toThrow(ForbiddenException);
  });

  it('ignores non-HTTP contexts', () => {
    passes(ctx('POST', 'EXPIRED', { type: 'rpc' }));
  });

  it('lets a write through when the flag is OFF (QM-15) — today’s behaviour', () => {
    flags.isEnabled.mockReturnValue(false);
    passes(ctx('POST', 'EXPIRED'));
  });

  it('lets a write through on a handler or class marked @AllowWhileReadOnly()', () => {
    class Plain {
      run(): void {}
    }
    @AllowWhileReadOnly()
    class Marked {}
    const handler = Plain.prototype.run;
    AllowWhileReadOnly()(
      Plain.prototype,
      'run',
      Object.getOwnPropertyDescriptor(Plain.prototype, 'run')!,
    );
    passes(ctx('POST', 'EXPIRED', { handler }));
    next.handle.mockClear();
    passes(ctx('POST', 'EXPIRED', { cls: Marked }));
    expect(flags.isEnabled).not.toHaveBeenCalled();
  });

  it('ships the flag OFF in the registry defaults', () => {
    expect(DEFAULT_FLAGS[TRIAL_LIFECYCLE_FLAG]).toBe(false);
  });
});

describe('@AllowWhileReadOnly() exemptions (§7.10) — exactly auth/session and data-subject rights', () => {
  const marked = (target: object) =>
    Reflect.getMetadata(ALLOW_WHILE_READ_ONLY_KEY, target) === true;

  it('covers every authentication and session endpoint', () => {
    expect(marked(IdentityController)).toBe(true);
  });

  it('covers consent changes (PDPA §19) and the data-export request (§30/§31)', () => {
    expect(marked(ConsentController.prototype.record)).toBe(true);
    expect(marked(DataExportController.prototype.request)).toBe(true);
  });
});
