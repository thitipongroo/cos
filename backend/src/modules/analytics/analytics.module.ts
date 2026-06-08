import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { createClient, ClickHouseClient } from '@clickhouse/client';
import { redisInsStore } from 'cache-manager-ioredis-yet';
import Redis from 'ioredis';
import { AnalyticsService } from './analytics.service';
import { AnalyticsExecutiveController } from './analytics.executive.controller';
import { AnalyticsPmController } from './analytics.pm.controller';
import { AnalyticsTrendsController } from './analytics.trends.controller';

export const CLICKHOUSE_CLIENT = 'CLICKHOUSE_CLIENT';

// Cache TTL: 5 minutes — spec §Phase 14 Caching Strategy
const CACHE_TTL_MS = 5 * 60 * 1000;

@Module({
  imports: [
    ConfigModule,
    CacheModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (cfg: ConfigService) => {
        const client = new Redis(cfg.getOrThrow<string>('REDIS_URL'));
        return {
          store: await redisInsStore(client),
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
export class AnalyticsModule {}
