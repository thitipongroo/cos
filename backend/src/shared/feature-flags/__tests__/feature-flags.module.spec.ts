import { Test } from '@nestjs/testing';
import { FeatureFlagsModule } from '../feature-flags.module';
import { FeatureFlagService } from '../feature-flag.service';
import { FlagsController } from '../flags.controller';

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), error: jest.fn() }),
}));

describe('FeatureFlagsModule', () => {
  it('compiles and exposes FeatureFlagService + FlagsController', async () => {
    delete process.env['UNLEASH_URL'];
    const mod = await Test.createTestingModule({ imports: [FeatureFlagsModule] }).compile();
    expect(mod.get(FeatureFlagService)).toBeInstanceOf(FeatureFlagService);
    expect(mod.get(FlagsController)).toBeInstanceOf(FlagsController);
    await mod.close();
  });
});
