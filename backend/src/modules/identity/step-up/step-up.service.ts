// Step-up verification (ADR-078) — re-prove possession before a high-value action.
//
// WHY THIS IS NOT THE LOGIN OTP. ADR-078 rejected "reuse the login OTP endpoints with a flag"
// explicitly: a code minted for a step-up would then be redeemable at /auth/otp/verify for a full
// session, turning a data-export confirmation into a privilege-escalation path. Everything here is
// therefore separate from OtpService:
//
//   - its own Redis namespace (`stepup:*`, never `otp:*`), so a step-up code cannot satisfy a login
//     and requesting one cannot clobber a pending login code for the same person;
//   - it mints an ACTION TOKEN, never tokens. The action token is bound to one user AND one action,
//     lives 5 minutes, is consumed on first use, and no code path exchanges it for an access token.
//
// It DOES share the credential primitives (generateOtp / otpMatches) with OtpService — a second copy
// of "generate a 6-digit code" is how one flow ends up with a weaker RNG than the other.
//
// DELIVERY CHANNEL (product-owner decision 2026-08-04): phone if the account has one, otherwise
// email. Not a preference — a fact about the account. `platform.users.phone_number` is nullable
// (Path B office accounts have none) while `email` is NOT NULL, so email is the only channel every
// user is reachable on, and SMS is preferred where available because Path A field workers may have
// no mail client on the device. Delivery goes straight to the adapters, NOT through
// NotificationService: its quiet-hours and per-user channel preferences (§19.6) would let a subject
// silently suppress their own security code.

import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
  OnModuleDestroy,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@cos/logger';
import { createPrismaClient } from '../../../shared/prisma/create-prisma-client';
import { SendGridAdapter } from '../../notification/adapters/sendgrid.adapter';
import { SMS_SENDER, type SmsSender } from '../otp/sms-sender';
import { generateOtp, otpMatches } from '../otp/otp.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { randomBytes } = require('crypto') as typeof import('crypto');

const logger = createLogger('step-up-service');

const CODE_TTL_SECONDS = 300; // 5 minutes — same window as the login OTP
const MAX_ATTEMPTS = 3;
const DAILY_LIMIT = 10;
// The action token is handed straight back to the client, which immediately submits the action, so
// it needs far less life than the code. A long-lived token is a stolen-token window for nothing.
const ACTION_TOKEN_TTL_SECONDS = 300;

/** Actions that can be confirmed by a step-up. Adding one is a deliberate decision, not a string. */
export const STEP_UP_ACTIONS = ['data-export'] as const;
export type StepUpAction = (typeof STEP_UP_ACTIONS)[number];

export interface StepUpChallenge {
  channel: 'SMS' | 'EMAIL';
  /** Masked destination so the UI can say "ending in ••••4567" without the client holding the value. */
  destinationHint: string;
  expiresInSeconds: number;
}

/** Mask everything but the last 4 characters — enough to recognise, useless to an attacker. */
export function maskDestination(value: string): string {
  const tail = value.slice(-4);
  return `••••${tail}`;
}

@Injectable()
export class StepUpService implements OnModuleDestroy {
  private readonly redis: Redis;
  // Platform client: platform.users is cross-tenant identity data and this reads only the caller's
  // own row by primary key.
  private readonly prisma: PrismaClient = createPrismaClient();

  constructor(
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    private readonly email: SendGridAdapter,
  ) {
    this.redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
  }

  /** ADR-034 / Rule 39 — both handles are long-lived and must close on shutdown. */
  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.redis.quit(), this.prisma.$disconnect()]);
  }

  private codeKey(userId: string, action: StepUpAction): string {
    return `stepup:code:${userId}:${action}`;
  }

  private attemptsKey(userId: string, action: StepUpAction): string {
    return `stepup:attempts:${userId}:${action}`;
  }

  private tokenKey(token: string): string {
    return `stepup:token:${token}`;
  }

  /**
   * Send a step-up code for `action` to the caller's registered channel.
   *
   * Returns the channel and a masked destination so the screen can tell the user where to look. The
   * full address is never returned — the client already knows who it is signed in as, and echoing a
   * phone number or email back widens what a stolen session reveals.
   */
  async request(userId: string, action: StepUpAction): Promise<StepUpChallenge> {
    await this.enforceDailyLimit(userId);

    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { phoneNumber: true, email: true, isActive: true },
    });
    // A deactivated account must not be able to mint a token for an action it can no longer perform.
    if (!user?.isActive) {
      throw new BadRequestException('Account is not eligible for verification');
    }

    const code = generateOtp();
    await this.redis.set(this.codeKey(userId, action), code, 'EX', CODE_TTL_SECONDS);
    await this.redis.set(this.attemptsKey(userId, action), '0', 'EX', CODE_TTL_SECONDS);

    const message = `Your Construction OS verification code is: ${code}. Valid for 5 minutes.`;
    if (user.phoneNumber) {
      await this.sms.sendSms(user.phoneNumber, message);
      // @pdpa: never log the destination or the code — both are PII / a live credential (QM-8).
      logger.info({ userId, action, channel: 'SMS' }, 'step-up code sent');
      return {
        channel: 'SMS',
        destinationHint: maskDestination(user.phoneNumber),
        expiresInSeconds: CODE_TTL_SECONDS,
      };
    }

    await this.email.send({
      to: user.email,
      subject: 'Construction OS verification code',
      body: message,
    });
    logger.info({ userId, action, channel: 'EMAIL' }, 'step-up code sent');
    return {
      channel: 'EMAIL',
      destinationHint: maskDestination(user.email),
      expiresInSeconds: CODE_TTL_SECONDS,
    };
  }

  /**
   * Exchange a correct code for a single-use action token.
   *
   * The attempt budget is claimed with an atomic INCR BEFORE the comparison — the same ordering
   * security review F6 forced on the login OTP. Reading the counter, comparing, then incrementing
   * only on a miss lets N concurrent requests all observe the same pre-increment value, turning a
   * 3-guess budget into "3 guesses per round trip of parallelism" against a 6-digit space.
   */
  async verify(userId: string, action: StepUpAction, code: string): Promise<string> {
    const codeKey = this.codeKey(userId, action);
    const attemptsKey = this.attemptsKey(userId, action);

    const stored = await this.redis.get(codeKey);
    if (!stored) {
      throw new BadRequestException('Verification code expired or not requested');
    }

    const attempts = await this.redis.incr(attemptsKey);
    if (attempts > MAX_ATTEMPTS) {
      await this.redis.del(codeKey, attemptsKey);
      throw new HttpException(
        'Maximum verification attempts exceeded — request a new code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!otpMatches(code, stored)) {
      logger.warn({ userId, action }, 'step-up verification failed');
      throw new BadRequestException('Invalid verification code');
    }

    await this.redis.del(codeKey, attemptsKey);

    // 32 bytes from a CSPRNG. The token is the whole authorisation for the action, so it must not be
    // guessable and must not encode anything — the binding lives server-side, under the key.
    const token = randomBytes(32).toString('base64url');
    await this.redis.set(
      this.tokenKey(token),
      JSON.stringify({ userId, action }),
      'EX',
      ACTION_TOKEN_TTL_SECONDS,
    );
    logger.info({ userId, action }, 'step-up verified');
    return token;
  }

  /**
   * Spend an action token. Returns true only for a token minted for THIS user and THIS action.
   *
   * Single-use: the key is deleted before the contents are judged, so a token cannot be replayed
   * even by racing two requests. A token presented for the wrong action or the wrong user is
   * consumed and rejected — leaving it alive would let an attacker keep trying it elsewhere.
   */
  async consume(token: string, userId: string, action: StepUpAction): Promise<boolean> {
    const key = this.tokenKey(token);
    const raw = await this.redis.get(key);
    await this.redis.del(key);
    if (!raw) return false;

    const bound = JSON.parse(raw) as { userId: string; action: string };
    return bound.userId === userId && bound.action === action;
  }

  /** Per-user daily cap, mirroring the login OTP's per-phone cap (Phase 2: 10/day). */
  private async enforceDailyLimit(userId: string): Promise<void> {
    const key = `stepup:daily:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, 86_400);
    }
    if (count > DAILY_LIMIT) {
      throw new HttpException('Daily verification limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
