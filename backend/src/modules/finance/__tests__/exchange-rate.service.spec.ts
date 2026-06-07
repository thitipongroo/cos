// Unit tests — ExchangeRateService (Phase 7)
// Verifies: Redis caching, API fetch, stale-while-revalidate fallback,
//           convert logic, and cron refresh.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

// ── Mock ioredis ────────────────────────────────────────────────────────────

const mockGet = jest.fn();
const mockSet = jest.fn().mockResolvedValue('OK');
const mockQuit = jest.fn().mockResolvedValue(undefined);

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
    quit: mockQuit,
  })),
}));

// ── Mock @nestjs/schedule (decorators) ──────────────────────────────────────

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
}));

// ── Mock global fetch ───────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { Decimal } from '@cos/financial';
import { ExchangeRateService } from '../exchange-rate.service';

// ── Fixtures ────────────────────────────────────────────────────────────────

const RATES = { THB: 34.5, SGD: 1.35, USD: 1, EUR: 0.93, MYR: 4.7 };

function mockApiResponse(rates = RATES): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ base: 'USD', rates }),
  });
}

// ── Setup ───────────────────────────────────────────────────────────────────

let svc: ExchangeRateService;

beforeEach(() => {
  jest.clearAllMocks();
  svc = new ExchangeRateService();
});

afterEach(async () => {
  await svc.onModuleDestroy();
});

// ── convert ─────────────────────────────────────────────────────────────────

describe('convert', () => {
  it('returns amount unchanged when fromCurrency === toCurrency', async () => {
    const result = await svc.convert(new Decimal('100'), 'THB', 'THB');
    expect(result.toFixed(4)).toBe('100.0000');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses cached rates when Redis hit', async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify(RATES));
    const result = await svc.convert(new Decimal('345'), 'THB', 'USD');
    // 345 THB / 34.5 = 10 USD
    expect(Number(result.toFixed(4))).toBeCloseTo(10, 2);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches from API on cache miss and stores in Redis', async () => {
    mockGet.mockResolvedValueOnce(null);
    mockApiResponse();
    await svc.convert(new Decimal('345'), 'THB', 'USD');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(
      'finance:exchange_rates:usd_base',
      JSON.stringify(RATES),
      'EX',
      86400,
    );
  });

  it('converts THB → SGD correctly', async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify(RATES));
    // 345 THB → USD: 345 / 34.5 = 10 → SGD: 10 * 1.35 = 13.5
    const result = await svc.convert(new Decimal('345'), 'THB', 'SGD');
    expect(Number(result.toFixed(4))).toBeCloseTo(13.5, 2);
  });

  it('converts from/to USD correctly', async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify(RATES));
    // 100 USD → THB: 100 * 34.5 = 3450
    const result = await svc.convert(new Decimal('100'), 'USD', 'THB');
    expect(Number(result.toFixed(4))).toBeCloseTo(3450, 0);
  });

  it('throws when fromCurrency rate is not in rates', async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify(RATES));
    await expect(svc.convert(new Decimal('100'), 'XYZ', 'THB')).rejects.toThrow(
      'Exchange rate not found for pair XYZ/THB',
    );
  });

  it('throws when toCurrency rate is not in rates', async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify(RATES));
    await expect(svc.convert(new Decimal('100'), 'THB', 'XYZ')).rejects.toThrow(
      'Exchange rate not found for pair THB/XYZ',
    );
  });

  it('throws when API fails and no cache exists', async () => {
    mockGet.mockResolvedValueOnce(null);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });
    await expect(svc.convert(new Decimal('100'), 'THB', 'USD')).rejects.toThrow(
      'Exchange rates unavailable',
    );
  });

  it('rounds result to 4 decimal places', async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify(RATES));
    const result = await svc.convert(new Decimal('1'), 'THB', 'EUR');
    // 1 / 34.5 * 0.93
    expect(result.decimalPlaces()).toBeLessThanOrEqual(4);
  });
});

// ── getRate ──────────────────────────────────────────────────────────────────

describe('getRate', () => {
  it('returns 1.0000 for same currency', async () => {
    const result = await svc.getRate('THB', 'THB');
    expect(result.toFixed(4)).toBe('1.0000');
  });

  it('returns exchange rate between two different currencies', async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify(RATES));
    const result = await svc.getRate('USD', 'THB');
    expect(Number(result.toFixed(4))).toBeCloseTo(34.5, 1);
  });
});

// ── refreshRates ─────────────────────────────────────────────────────────────

describe('refreshRates', () => {
  it('fetches and caches rates on schedule', async () => {
    mockGet.mockResolvedValueOnce(null);
    mockApiResponse();
    await svc.refreshRates();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('swallows API errors without throwing', async () => {
    mockGet.mockResolvedValueOnce(null);
    mockFetch.mockRejectedValueOnce(new Error('network timeout'));
    await expect(svc.refreshRates()).resolves.not.toThrow();
  });
});

// ── onModuleDestroy ───────────────────────────────────────────────────────────

describe('onModuleDestroy', () => {
  it('calls redis.quit()', async () => {
    await svc.onModuleDestroy();
    expect(mockQuit).toHaveBeenCalledTimes(1);
  });

  it('swallows quit errors', async () => {
    mockQuit.mockRejectedValueOnce(new Error('already closed'));
    await expect(svc.onModuleDestroy()).resolves.not.toThrow();
  });
});
