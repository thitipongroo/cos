// NotificationPrismaService — per-call PrismaClient for the notifications schema.
// Creates a new PrismaClient per run() call using the tenant's resolved DB URL.
// Supports dedicated DB for enterprise tenants via getDbUrlForTenant().
// NOT request-scoped: used by both HTTP path (NotificationRepository) and Kafka consumer path.

import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { getDbUrlForTenant } from '../tenant/utils/get-db-url';

@Injectable()
export class NotificationPrismaService {
  async run<T>(
    tenantId: string,
    fn: (
      tx: Omit<
        PrismaClient,
        '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
      >,
    ) => Promise<T>,
  ): Promise<T> {
    const dbUrl = await getDbUrlForTenant(tenantId);
    const prisma = new PrismaClient({
      datasources: { db: { url: dbUrl } },
    });
    try {
      return await prisma.$transaction(async (tx) => {
        return fn(tx);
      });
    } finally {
      await prisma.$disconnect();
    }
  }
}
