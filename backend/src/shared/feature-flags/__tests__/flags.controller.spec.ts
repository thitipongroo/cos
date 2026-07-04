import { Test } from '@nestjs/testing';
import { FlagsController } from '../flags.controller';
import { FeatureFlagService } from '../feature-flag.service';

describe('FlagsController', () => {
  const allFlags = jest.fn();

  async function build(): Promise<FlagsController> {
    const mod = await Test.createTestingModule({
      controllers: [FlagsController],
      providers: [{ provide: FeatureFlagService, useValue: { allFlags } }],
    }).compile();
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

  it('works for unauthenticated requests (no userId/tenantId projected)', async () => {
    allFlags.mockReturnValue({});
    const controller = await build();
    expect(controller.getFlags({})).toEqual({ flags: {} });
    expect(allFlags).toHaveBeenCalledWith({ userId: undefined, tenantId: undefined });
  });
});
