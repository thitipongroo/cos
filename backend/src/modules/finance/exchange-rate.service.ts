// ExchangeRateService — Phase 7
// Fetches rates from Open Exchange Rates API; caches in Redis with 24h TTL.
// Fallback: use last cached rate if API unavailable (stale-while-revalidate).
// Daily refresh scheduled at 00:00 UTC via @nestjs/schedule Cron.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Redis } from 'ioredis';
import { Decimal } from '@cos/financial';
import { createLogger } from '@cos/logger';

const logger = createLogger('exchange-rate-service');

const BASE_CURRENCY = 'USD';
const CACHE_TTL_SECONDS = 86400; // 24h
const REDIS_KEY = 'finance:exchange_rates:usd_base';
// getRates() falls through to a live fetch on a cache miss, so this call sits on a request path. An
// unbounded fetch would pin that request to however long the upstream takes to give up. Matches the
// AbortSignal.timeout() every other outbound client here uses (geo, file-service, credentials).
const FETCH_TIMEOUT_MS = 5000;

interface OerResponse {
  base: string;
  rates: Record<string, number>;
}

@Injectable()
export class ExchangeRateService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
  }

  /**
   * Convert amount from one currency to another.
   * All conversions go through USD as the base currency.
   * Rounds final result to 4 decimal places per spec.
   */
  async convert(amount: Decimal, fromCurrency: string, toCurrency: string): Promise<Decimal> {
    if (fromCurrency === toCurrency) return amount;

    const rates = await this.getRates();

    const fromRate = fromCurrency === BASE_CURRENCY ? 1 : rates[fromCurrency];
    const toRate = toCurrency === BASE_CURRENCY ? 1 : rates[toCurrency];

    if (!fromRate || !toRate) {
      throw new Error(`Exchange rate not found for pair ${fromCurrency}/${toCurrency}`);
    }

    // Convert to USD then to target currency
    const usd = amount.dividedBy(new Decimal(fromRate.toString()));
    return usd.times(new Decimal(toRate.toString())).toDecimalPlaces(4);
  }

  /** Get the exchange rate from fromCurrency to toCurrency (amount = 1). */
  async getRate(fromCurrency: string, toCurrency: string): Promise<Decimal> {
    return this.convert(new Decimal('1'), fromCurrency, toCurrency);
  }

  /** Daily refresh at 00:00 UTC — cron expression: minute 0, hour 0, every day. */
  @Cron('0 0 * * *', { timeZone: 'UTC', name: 'exchange-rate-refresh' })
  async refreshRates(): Promise<void> {
    logger.info('Refreshing exchange rates from Open Exchange Rates API');
    try {
      await this.fetchAndCache();
    } catch (err) {
      logger.error({ err }, 'Failed to refresh exchange rates — stale cache remains active');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch((err: unknown) => logger.error({ err }, 'Redis quit error'));
  }

  // ── private ────────────────────────────────────────────────────────────────

  private async getRates(): Promise<Record<string, number>> {
    const cached = await this.redis.get(REDIS_KEY);
    if (cached) {
      return JSON.parse(cached) as Record<string, number>;
    }

    // Cache miss — fetch live and populate
    try {
      return await this.fetchAndCache();
    } catch (err) {
      logger.error({ err }, 'Exchange rate API unavailable and no cached rates found');
      throw new Error('Exchange rates unavailable');
    }
  }

  private async fetchAndCache(): Promise<Record<string, number>> {
    const appId = process.env['OPEN_EXCHANGE_RATES_APP_ID'] ?? '';
    const url = `https://openexchangerates.org/api/latest.json?app_id=${appId}&base=${BASE_CURRENCY}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      throw new Error(`Open Exchange Rates API error: ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as OerResponse;
    const rates = body.rates;

    await this.redis.set(REDIS_KEY, JSON.stringify(rates), 'EX', CACHE_TTL_SECONDS);
    logger.info({ currencies: Object.keys(rates).length }, 'Exchange rates cached');
    return rates;
  }
}
