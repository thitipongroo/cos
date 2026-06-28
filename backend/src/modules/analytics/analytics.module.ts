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

// The CacheModule factory below OWNS this Redis client but @nestjs/cache-manager never closes the
// underlying ioredis on shutdown, so the socket + reconnect timer leak past app.close(). Hold a
// module-scoped reference and quit it in AnalyticsModule.onModuleDestroy (Nest invokes lifecycle
// hooks on module classes). Module is a singleton imported once, so a single reference is correct.
let cacheRedis: Redis | undefined;

@Module({
  imports: [
    ConfigModule,
    CacheModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (cfg: ConfigService) => {
        cacheRedis = new Redis(cfg.getOrThrow<string>('REDIS_URL'));
        return {
          store: await redisInsStore(cacheRedis),
          ttl: CACHE_TTL_MS,
        };
      },
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
  constructor(@Inject(CLICKHOUSE_CLIENT) private readonly clickhouse: ClickHouseClient) {}

  /** Close the cache Redis client and the ClickHouse client on shutdown so neither leaks. */
  async onModuleDestroy(): Promise<void> {
    await cacheRedis?.quit().catch(() => undefined);
    await this.clickhouse.close().catch(() => undefined);
  }
}
