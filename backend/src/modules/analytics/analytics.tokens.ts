// Analytics Module DI tokens — kept in a leaf file (no imports of the module or
// service) so analytics.service.ts and analytics.module.ts can both reference the
// token without forming a circular import that would leave CLICKHOUSE_CLIENT
// undefined at decoration time and break Nest DI.
export const CLICKHOUSE_CLIENT = 'CLICKHOUSE_CLIENT';
