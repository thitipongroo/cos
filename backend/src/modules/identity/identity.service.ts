// Identity Service — Phase 2
// Issues COS JWTs for Path A (OTP) users.
// Path B (Keycloak) tokens come directly from Keycloak — this service handles refresh/logout.

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { createLogger } from '@cos/logger';
import { JwtPayload } from './jwt.payload';

const logger = createLogger('identity-service');

const ACCESS_TOKEN_TTL = 15 * 60;           // 15 min
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days

@Injectable()
export class IdentityService {
  private readonly prisma = new PrismaClient();
  private readonly redis: Redis;

  constructor(private readonly jwtService: JwtService) {
    this.redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
  }

  /** Issue access + refresh tokens for a verified OTP phone login. */
  async issueTokensForPhone(phoneNumber: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    // Look up user by phone — keycloak_user_id stores phone for Path A users
    const [user] = await this.prisma.$queryRaw<Array<{
      user_id: string;
      tenant_id: string;
      tenant_code: string;
      role: string;
    }>>`
      SELECT u.user_id, u.tenant_id, t.tenant_code, m.role
      FROM platform.users u
      JOIN platform.tenants t ON t.tenant_id = u.tenant_id
      JOIN platform.tenant_memberships m ON m.user_id = u.user_id AND m.tenant_id = u.tenant_id
      WHERE u.keycloak_user_id = ${phoneNumber}
        AND u.is_active = true AND t.is_active = true
      LIMIT 1
    `;

    if (!user) {
      // @pdpa: phone [REDACTED]
      logger.warn({ phone: '[REDACTED]' }, 'OTP verified but user not found');
      throw new UnauthorizedException('User not found');
    }

    const payload: Partial<JwtPayload> = {
      sub: user.user_id,
      cos_tenant_id: user.tenant_id,
      cos_tenant_code: user.tenant_code,
      cos_user_id: user.user_id,
      cos_role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
    const refreshToken = this.jwtService.sign(
      { ...payload, type: 'refresh' },
      { expiresIn: REFRESH_TOKEN_TTL },
    );

    // Store refresh token in Redis for revocation
    await this.redis.set(
      `refresh:${user.user_id}:${refreshToken.slice(-8)}`,
      user.user_id,
      'EX',
      REFRESH_TOKEN_TTL,
    );

    logger.info({ userId: user.user_id, tenantCode: user.tenant_code }, 'Tokens issued (Path A)');
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify(refreshToken) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Check revocation store
    const stored = await this.redis.get(
      `refresh:${payload.cos_user_id}:${refreshToken.slice(-8)}`,
    );
    if (!stored) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    const newAccess = this.jwtService.sign(
      {
        sub: payload.sub,
        cos_tenant_id: payload.cos_tenant_id,
        cos_tenant_code: payload.cos_tenant_code,
        cos_user_id: payload.cos_user_id,
        cos_role: payload.cos_role,
      },
      { expiresIn: ACCESS_TOKEN_TTL },
    );

    return { accessToken: newAccess, expiresIn: ACCESS_TOKEN_TTL };
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = this.jwtService.verify(refreshToken) as JwtPayload;
      await this.redis.del(`refresh:${payload.cos_user_id}:${refreshToken.slice(-8)}`);
      logger.info({ userId: payload.cos_user_id }, 'User logged out');
    } catch {
      // Token already invalid — no-op
    }
  }
}
