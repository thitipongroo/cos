// Analytics Module DI tokens — kept in a leaf file (no imports of the module or
// service) so analytics.service.ts and analytics.module.ts can both reference the
// token without forming a circular import that would leave CLICKHOUSE_CLIENT
// undefined at decoration time and break Nest DI.
export const CLICKHOUSE_CLIENT = 'CLICKHOUSE_CLIENT';

// The raw ioredis client backing the cache store. AnalyticsService needs it for pattern-based
// invalidation: cache-manager exposes only get/set/del on a single exact key, which is why the
// previous invalidate() passed a literal '*' as part of the key and therefore deleted nothing.
export const CACHE_REDIS = 'ANALYTICS_CACHE_REDIS';
