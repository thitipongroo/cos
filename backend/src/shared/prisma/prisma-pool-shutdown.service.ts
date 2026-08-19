import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { endSharedPgPools } from './create-prisma-client';

/**
 * Closes the shared pg connection pools during graceful shutdown.
 *
 * Every PrismaClient in the process draws from one pool per datasource (create-prisma-client.ts), and
 * a client's own `$disconnect()` deliberately does NOT end that pool — it is shared, so no single
 * owner may close it. That leaves exactly one place responsible for the sockets, and this is it.
 *
 * onApplicationShutdown runs last in the Nest lifecycle, after every provider's onModuleDestroy has
 * released its client, so the pools are only ended once nothing is still querying through them.
 * Without this hook the pools survive SIGTERM (and app.close() in tests), holding their PgBouncer
 * client slots until the process is killed.
 */
@Injectable()
export class PrismaPoolShutdownService implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await endSharedPgPools();
  }
}
