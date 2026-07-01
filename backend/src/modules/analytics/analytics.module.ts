import { Module, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { createClient, ClickHouseClient } from '@clickhouse/client';
import { redisInsStore } from 'cache-manager-ioredis-yet';
import Redis from 'ioredis';
import { AnalyticsService } from './analytics.service';
import { AnalyticsExecutiveController } from './analytics.executive.controller';
import { AnalyticsPmController } from './analytics.pm.controller';
import { AnalyticsTrendsController } from './analytics.trends.controller';
import { CLICKHOUSE_CLIENT } from './analytics.tokens';

export { CLICKHOUSE_CLIENT };

// Cache TTL: 5 minutes — spec §Phase 14 Caching Strategy
const CACHE_TTL_MS = 5 * 60 * 1000;

// The cache Redis client is a PROVIDER (not a module-scoped `let`) so each AnalyticsModule instance
// owns its own client and closes it in onModuleDestroy (ADR-034). A module-scoped variable leaks
// when the module is instantiated more than once (e.g. integration tests build the app per-suite):
// every instance's CacheModule factory overwrites the shared reference, so all but the last client
// leak their socket + reconnect timer past app.close() and hang Jest.
const CACHE_REDIS = Symbol('ANALYTICS_CACHE_REDIS');

// Owns the cache Redis client and exports it. Imported by both AnalyticsModule (so its class can
// close the client) and the CacheModule.registerAsync below (so the store uses the same instance).
// Nest treats the imported module as one instance per AnalyticsModule, so client and closer match.
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CACHE_REDIS,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): Redis => new Redis(cfg.getOrThrow<string>('REDIS_URL')),
    },
  ],
  exports: [CACHE_REDIS],
})
class CacheRedisModule {}

@Module({
  imports: [
    ConfigModule,
    CacheRedisModule,
    CacheModule.registerAsync({
      imports: [CacheRedisModule],
      inject: [CACHE_REDIS],
      useFactory: async (redis: Redis) => ({
        store: await redisInsStore(redis),
        ttl: CACHE_TTL_MS,
      }),
    }),
  ],
  controllers: [AnalyticsExecutiveController, AnalyticsPmController, AnalyticsTrendsController],
  providers: [
    {
      provide: CLICKHOUSE_CLIENT,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): ClickHouseClient =>
        createClient({
          url: cfg.getOrThrow<string>('CLICKHOUSE_URL'),
          username: cfg.getOrThrow<string>('CLICKHOUSE_USER'),
          password: cfg.getOrThrow<string>('CLICKHOUSE_PASSWORD'),
          database: cfg.get<string>('CLICKHOUSE_DB', 'analytics'),
        }),
    },
    AnalyticsService,
  ],
  exports: [AnalyticsService],
})
export class AnalyticsModule implements OnModuleDestroy {
  constructor(
    @Inject(CLICKHOUSE_CLIENT) private readonly clickhouse: ClickHouseClient,
    @Inject(CACHE_REDIS) private readonly cacheRedis: Redis,
  ) {}

  /** Close the cache Redis client and the ClickHouse client on shutdown so neither leaks. */
  async onModuleDestroy(): Promise<void> {
    await this.cacheRedis.quit().catch(() => undefined);
    await this.clickhouse.close().catch(() => undefined);
  }
}
