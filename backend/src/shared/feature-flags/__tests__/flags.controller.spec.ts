import { Test } from '@nestjs/testing';
import { FlagsController } from '../flags.controller';
import { FeatureFlagService } from '../feature-flag.service';
import { OptionalJwtAuthGuard } from '../../../modules/identity/guards/optional-jwt-auth.guard';

describe('FlagsController', () => {
  const allFlags = jest.fn();

  async function build(): Promise<FlagsController> {
    const mod = await Test.createTestingModule({
      controllers: [FlagsController],
      providers: [{ provide: FeatureFlagService, useValue: { allFlags } }],
    })
      // The guard's real dependencies (ClsService, LastSeenService, the passport strategy) live
      // outside this module; its own behaviour is covered in optional-jwt-auth.guard.spec.
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    return mod.get(FlagsController);
  }

  beforeEach(() => jest.clearAllMocks());

  it('returns the server-evaluated flag map for the request context', async () => {
    allFlags.mockReturnValue({ 's1.identity.sms-otp-login': true });
    const controller = await build();
    const result = controller.getFlags({ userId: 'u1', tenantId: 't1' });
    expect(result).toEqual({ flags: { 's1.identity.sms-otp-login': true } });
    expect(allFlags).toHaveBeenCalledWith({ userId: 'u1', tenantId: 't1' });
  });

  // Anonymous is a supported case, not an accident: the login screen reads flags before any token
  // exists, which is why the route uses OptionalJwtAuthGuard rather than JwtAuthGuard.
  it('works for unauthenticated requests (no userId/tenantId projected)', async () => {
    allFlags.mockReturnValue({});
    const controller = await build();
    expect(controller.getFlags({})).toEqual({ flags: {} });
    expect(allFlags).toHaveBeenCalledWith({ userId: undefined, tenantId: undefined });
  });
});
