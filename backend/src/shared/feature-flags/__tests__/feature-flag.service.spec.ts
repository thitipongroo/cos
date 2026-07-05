import { FeatureFlagService, DEFAULT_FLAGS } from '../feature-flag.service';

const mockOn = jest.fn();
const mockIsEnabled = jest.fn();
const mockGetDefs = jest.fn();
const mockDestroy = jest.fn();

jest.mock('unleash-client', () => ({
  initialize: jest.fn(() => ({
    on: mockOn,
    isEnabled: mockIsEnabled,
    getFeatureToggleDefinitions: mockGetDefs,
    destroy: mockDestroy,
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { initialize } = require('unleash-client') as { initialize: jest.Mock };

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), error: jest.fn() }),
}));

describe('FeatureFlagService — fallback mode (UNLEASH_URL unset)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['UNLEASH_URL'];
  });

  it('serves DEFAULT_FLAGS without initializing Unleash', () => {
    const svc = new FeatureFlagService();
    expect(initialize).not.toHaveBeenCalled();
    expect(svc.isEnabled('s1.identity.sms-otp-login')).toBe(true);
  });

  it('returns false for a flag not in the registry', () => {
    const svc = new FeatureFlagService();
    expect(svc.isEnabled('s9.unknown.flag')).toBe(false);
  });

  it('allFlags returns the full registry defaults', () => {
    const svc = new FeatureFlagService();
    expect(svc.allFlags()).toEqual({ ...DEFAULT_FLAGS });
  });

  it('onModuleDestroy is a no-op without a client', () => {
    const svc = new FeatureFlagService();
    expect(() => svc.onModuleDestroy()).not.toThrow();
    expect(mockDestroy).not.toHaveBeenCalled();
  });
});

describe('FeatureFlagService — Unleash mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['UNLEASH_URL'] = 'http://unleash.local/api';
    delete process.env['UNLEASH_APP_NAME'];
    delete process.env['UNLEASH_API_TOKEN'];
  });

  afterEach(() => {
    delete process.env['UNLEASH_URL'];
    delete process.env['UNLEASH_APP_NAME'];
    delete process.env['UNLEASH_API_TOKEN'];
  });

  it('initializes the client with defaults and registers an error handler', () => {
    new FeatureFlagService();
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://unleash.local/api',
        appName: 'cos-backend',
        customHeaders: { Authorization: '' },
        refreshInterval: 15_000,
      }),
    );
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
    const handler = mockOn.mock.calls[0][1] as (err: unknown) => void;
    expect(() => handler(new Error('poll failed'))).not.toThrow();
  });

  it('honors UNLEASH_APP_NAME and UNLEASH_API_TOKEN when set', () => {
    process.env['UNLEASH_APP_NAME'] = 'cos-worker';
    process.env['UNLEASH_API_TOKEN'] = 'token-123';
    new FeatureFlagService();
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: 'cos-worker',
        customHeaders: { Authorization: 'token-123' },
      }),
    );
  });

  it('delegates isEnabled with user/tenant context and registry fallback', () => {
    mockIsEnabled.mockReturnValue(true);
    const svc = new FeatureFlagService();
    const result = svc.isEnabled('s1.finance.payment-mutations', { userId: 'u1', tenantId: 't1' });
    expect(result).toBe(true);
    expect(mockIsEnabled).toHaveBeenCalledWith(
      's1.finance.payment-mutations',
      { userId: 'u1', properties: { tenantId: 't1' } },
      true,
    );
  });

  it('passes false fallback for a flag not in the registry and empty tenantId', () => {
    mockIsEnabled.mockReturnValue(false);
    const svc = new FeatureFlagService();
    expect(svc.isEnabled('s9.unknown.flag')).toBe(false);
    expect(mockIsEnabled).toHaveBeenCalledWith(
      's9.unknown.flag',
      { userId: undefined, properties: { tenantId: '' } },
      false,
    );
  });

  it('allFlags merges registry defaults with Unleash definitions', () => {
    mockIsEnabled.mockReturnValue(true);
    mockGetDefs.mockReturnValue([{ name: 's1.procurement.bulk-upload' }]);
    const svc = new FeatureFlagService();
    const flags = svc.allFlags({ tenantId: 't1' });
    expect(Object.keys(flags).sort()).toEqual(
      [...Object.keys(DEFAULT_FLAGS), 's1.procurement.bulk-upload'].sort(),
    );
    expect(flags['s1.procurement.bulk-upload']).toBe(true);
  });

  it('allFlags tolerates getFeatureToggleDefinitions returning undefined', () => {
    mockIsEnabled.mockReturnValue(false);
    mockGetDefs.mockReturnValue(undefined);
    const svc = new FeatureFlagService();
    expect(Object.keys(svc.allFlags())).toEqual(Object.keys(DEFAULT_FLAGS));
  });

  it('onModuleDestroy destroys the Unleash client (ADR-034 / Rule 39)', () => {
    const svc = new FeatureFlagService();
    svc.onModuleDestroy();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});
