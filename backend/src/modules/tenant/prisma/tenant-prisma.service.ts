// TenantPrismaService — ADR-008
// Request-scoped service. Wraps every Prisma call in:
//   BEGIN; SET LOCAL search_path = {tenant_code}; <query>; COMMIT;
// SET LOCAL reverts on COMMIT/ROLLBACK — safe with PgBouncer transaction mode (QM-18).
// NEVER use singleton scope — tenant context is per-request.

import { Injectable, Scope, Inject, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import type { Request } from 'express';
import { withRetry } from '@cos/database';
import { createLogger } from '@cos/logger';

const logger = createLogger('tenant-prisma');

// Allowlist of valid tenant_code characters — prevents SQL injection via search_path
const TENANT_CODE_PATTERN = /^[a-z0-9_]{1,50}$/;

function assertSafeTenantCode(code: string): void {
  if (!TENANT_CODE_PATTERN.test(code)) {
    throw new UnauthorizedException(`Invalid tenant code format: ${code}`);
  }
}

@Injectable({ scope: Scope.REQUEST })
export class TenantPrismaService {
  private readonly prisma: PrismaClient;
  private readonly tenantCode: string;

  constructor(@Inject(REQUEST) request: Request & { tenantCode?: string }) {
    const code = request.tenantCode;
    if (!code) {
      throw new UnauthorizedException('Tenant context missing from request');
    }
    assertSafeTenantCode(code);
    this.tenantCode = code;
    this.prisma = new PrismaClient({
      datasources: { db: { url: process.env['DATABASE_URL'] } },
    });
  }

  /**
   * Execute fn inside a transaction with SET LOCAL search_path = {tenant_code}.
   * All tenant-scoped DB calls MUST go through this method.
   */
  async run<T>(fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T> {
    return withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SET LOCAL search_path = "${this.tenantCode}", public`,
        );
        logger.debug(
          { tenantCode: this.tenantCode },
          'TenantPrismaService: search_path set',
        );
        return fn(tx);
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
