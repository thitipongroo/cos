import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureFlagGuard } from '../feature-flag.guard';
import { FeatureFlag, FEATURE_FLAG_KEY } from '../feature-flag.decorator';
import type { FeatureFlagService } from '../feature-flag.service';

function makeContext(req: Record<string, unknown> = {}): ExecutionContext {
  return {
    getHandler: () => ({}) as never,
    getClass: () => ({}) as never,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('FeatureFlagGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let flags: { isEnabled: jest.Mock };
  let guard: FeatureFlagGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    flags = { isEnabled: jest.fn() };
    guard = new FeatureFlagGuard(
      reflector as unknown as Reflector,
      flags as unknown as FeatureFlagService,
    );
  });

  it('passes routes without @FeatureFlag metadata untouched', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(makeContext())).toBe(true);
    expect(flags.isEnabled).not.toHaveBeenCalled();
  });

  it('allows the request when the flag is enabled, passing user/tenant context', () => {
    reflector.getAllAndOverride.mockReturnValue('s1.identity.sms-otp-login');
    flags.isEnabled.mockReturnValue(true);
    expect(guard.canActivate(makeContext({ userId: 'u1', tenantId: 't1' }))).toBe(true);
    expect(flags.isEnabled).toHaveBeenCalledWith('s1.identity.sms-otp-login', {
      userId: 'u1',
      tenantId: 't1',
    });
  });

  it('throws 503 COS-FLAG-001 when the flag is disabled', () => {
    reflector.getAllAndOverride.mockReturnValue('s1.finance.payment-mutations');
    flags.isEnabled.mockReturnValue(false);
    let caught: unknown;
    try {
      guard.canActivate(makeContext());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    const response = (caught as ServiceUnavailableException).getResponse() as Record<
      string,
      unknown
    >;
    expect(response['code']).toBe('COS-FLAG-001');
    expect(response['messageKey']).toBe('common.featureFlag.disabled');
  });
});

describe('@FeatureFlag decorator', () => {
  it('sets FEATURE_FLAG_KEY metadata on the handler', () => {
    class TestController {
      @FeatureFlag('s1.ai.report-generation')
      generate(): void {}
    }
    const meta = Reflect.getMetadata(FEATURE_FLAG_KEY, TestController.prototype.generate);
    expect(meta).toBe('s1.ai.report-generation');
  });
});
