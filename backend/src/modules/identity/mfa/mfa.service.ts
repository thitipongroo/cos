// MFA Service — Phase 2
// TOTP-based MFA for TENANT_ADMIN and FINANCE roles (Path B office users).
// Enrollment: generate secret → store in Redis → user verifies → commit to DB.
// Authentication: verify TOTP token against DB-stored secret during login.

import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { authenticator } from 'otplib';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@cos/logger';

const logger = createLogger('mfa-service');

// Pending enrollment secret lives in Redis for 10 minutes — user must verify within this window.
const PENDING_SECRET_TTL_SECONDS = 600;

@Injectable()
export class MfaService {
  private readonly redis: Redis;
  private readonly prisma = new PrismaClient();

  constructor() {
    this.redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
  }

  /**
   * Step 1 of enrollment: generate a TOTP secret, store it in Redis pending confirmation.
   * Returns the otpauth:// URI for QR code rendering on the client.
   * The secret is NOT committed to the DB until verifyAndActivate() succeeds.
   */
  async generateEnrollmentSecret(
    userId: string,
    email: string,
  ): Promise<{
    otpAuthUrl: string;
    secret: string;
  }> {
    const secret = authenticator.generateSecret();
    await this.redis.set(`mfa:pending:${userId}`, secret, 'EX', PENDING_SECRET_TTL_SECONDS);
    const otpAuthUrl = authenticator.keyuri(email, 'Construction OS', secret);
    logger.info({ userId }, 'mfa.enroll.secret_generated');
    return { otpAuthUrl, secret };
  }

  /**
   * Step 2 of enrollment: verify TOTP token against the pending secret in Redis.
   * On success: writes secret + mfa_enabled=true to platform.users.
   */
  async verifyAndActivate(userId: string, token: string): Promise<void> {
    const secret = await this.redis.get(`mfa:pending:${userId}`);
    if (!secret) {
      throw new BadRequestException('No pending MFA enrollment or enrollment expired');
    }
    const valid = authenticator.verify({ token, secret });
    if (!valid) {
      throw new UnauthorizedException('Invalid TOTP token');
    }
    await this.prisma.$executeRaw`
      UPDATE platform.users
      SET mfa_totp_secret = ${secret},
          mfa_enabled     = true,
          updated_at      = now()
      WHERE user_id = ${userId}::uuid
    `;
    await this.redis.del(`mfa:pending:${userId}`);
    logger.info({ userId }, 'mfa.enroll.activated');
  }

  /**
   * Login step: verify TOTP token against the stored secret.
   * Called during Path B login after password auth succeeds.
   */
  async authenticate(userId: string, token: string): Promise<void> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        mfa_enabled: boolean;
        mfa_totp_secret: string | null;
      }>
    >`
      SELECT mfa_enabled, mfa_totp_secret
      FROM platform.users
      WHERE user_id = ${userId}::uuid
      LIMIT 1
    `;
    const user = rows[0];
    if (!user?.mfa_enabled || !user.mfa_totp_secret) {
      throw new BadRequestException('MFA not enrolled for this user');
    }
    const valid = authenticator.verify({ token, secret: user.mfa_totp_secret });
    if (!valid) {
      throw new UnauthorizedException('Invalid TOTP token');
    }
    logger.info({ userId }, 'mfa.authenticate.ok');
  }
}
