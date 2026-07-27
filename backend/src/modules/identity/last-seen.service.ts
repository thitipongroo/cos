// LastSeenService — records platform.users.last_seen_at from JwtAuthGuard on every authenticated
// request. Fire-and-forget + throttled in-memory (one write per user per THROTTLE_MS) so it never
// blocks the request nor hits the DB on the hot path more than necessary. Powers the Tenant Admin
// "User Audit" (users not seen in > 30 days). Because it runs on every request (not just login) it
// captures BOTH auth paths — Path A (phone OTP) and Path B (email/OIDC, which the backend never sees
// at login time).

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { createLogger } from '@cos/logger';

const logger = createLogger('last-seen-service');

@Injectable()
export class LastSeenService implements OnModuleDestroy {
  // Platform (RLS-exempt) client — the UPDATE carries an explicit user_id + tenant_id WHERE, so it only
  // ever touches the authenticated user's own row.
  private readonly prisma = createPrismaClient();
  private readonly lastTouch = new Map<string, number>();
  private static readonly THROTTLE_MS = 15 * 60 * 1000; // 15 minutes

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /** Best-effort: mark the user seen now, at most once per THROTTLE_MS. Never awaited by the caller. */
  touch(userId: string, tenantId: string): void {
    const now = Date.now();
    const prev = this.lastTouch.get(userId);
    if (prev !== undefined && now - prev < LastSeenService.THROTTLE_MS) return;
    this.lastTouch.set(userId, now);
    void this.prisma
      .$executeRaw`UPDATE platform.users SET last_seen_at = now() WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid`.catch(
      (err: unknown) => {
        // A missed touch only delays the audit signal — never surface it to the request.
        logger.debug({ err }, 'last-seen.touch.failed');
      },
    );
  }
}
