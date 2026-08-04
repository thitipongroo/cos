// Path A — SMS OTP Service for SITE_WORKER / SITE_ENGINEER
// Custom lightweight NestJS module — NOT via Keycloak extension (spec §Phase 2).
// OTP: 6-digit numeric, TTL 5min in Redis, max 3 attempts, 10 req/phone/day.
// SMS gateway: AWS SNS (ap-southeast-1) via @aws-sdk/client-sns.

import {
  Injectable,
  Inject,
  BadRequestException,
  HttpException,
  HttpStatus,
  OnModuleDestroy,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { createLogger } from '@cos/logger';
import { SMS_SENDER, type SmsSender } from './sms-sender';

// node:crypto builtin — loaded via require() (the in-repo idiom for builtins, cf.
// platform-webhook.service.ts) so it resolves under CommonJS without a package.json dep.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { randomInt, timingSafeEqual } = require('crypto') as typeof import('crypto');

const logger = createLogger('otp-service');

const OTP_TTL_SECONDS = 300; // 5 minutes
const OTP_MAX_ATTEMPTS = 3;
const OTP_DAILY_LIMIT = 10;
const OTP_LENGTH = 6;
// Minimum interval between two OTP sends to the same phone (§5.5 send-rate cap). Enforced server-side
// (a Redis cooldown key) AND surfaced to the client so it can disable "resend" with a countdown.
const RESEND_COOLDOWN_SECONDS = 60;

function generateOtp(): string {
  // crypto.randomInt is a CSPRNG — Math.random() is predictable and must never mint a credential.
  return randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, '0');
}

// Constant-time OTP comparison — avoids leaking how many leading digits matched via response timing.
function otpMatches(submitted: string, expected: string): boolean {
  const a = Buffer.from(submitted);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// E2E auth bypass — DOUBLE-GATED: only when E2E_AUTH_BYPASS=true AND NODE_ENV !== 'production'.
// When active, requestOtp() stores a DETERMINISTIC OTP (E2E_TEST_OTP, default '123456') so automated
// Detox specs can log in without an SMS round-trip. verifyOtp() is UNCHANGED — it still validates the
// submitted OTP against the stored one, so no verification step is skipped. This flag must never be set
// in production (it is additionally hard-gated off when NODE_ENV === 'production').
function e2eFixedOtp(): string | null {
  if (process.env['E2E_AUTH_BYPASS'] === 'true' && process.env['NODE_ENV'] !== 'production') {
    return process.env['E2E_TEST_OTP'] ?? '123456';
  }
  return null;
}

@Injectable()
export class OtpService implements OnModuleDestroy {
  private readonly redis: Redis;

  // SMS goes through the ADR-040 port, not a hardcoded SNSClient: the on-premise / air-gapped
  // deployments cannot reach AWS, and SMS-OTP is the ONLY login SITE_WORKER has.
  constructor(@Inject(SMS_SENDER) private readonly sms: SmsSender) {
    this.redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
  }

  /** Close the Redis connection on shutdown so the socket + reconnect timer do not leak. */
  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Request OTP — sends SMS and stores the OTP in Redis.
   * Stored as the raw value (not hashed): Redis is ephemeral with a 5-min TTL, never persisted to disk
   * or git, and a hash of a 6-digit code is trivially brute-forced (10^6 preimages) so it adds no real
   * protection. Confidentiality rests on Redis access control + short TTL.
   */
  async requestOtp(
    phoneNumber: string,
  ): Promise<{ expiresInSeconds: number; resendCooldownSeconds: number }> {
    const fixedOtp = e2eFixedOtp();
    // The E2E bypass skips BOTH the resend cooldown and the per-phone daily limit: automated suites
    // request many OTPs for the same test phone back-to-back. Production always enforces both.
    if (!fixedOtp) {
      await this.enforceResendCooldown(phoneNumber);
      await this.enforceDailyLimit(phoneNumber);
    }

    const otp = fixedOtp ?? generateOtp();
    const attemptsKey = `otp:attempts:${phoneNumber}`;
    const otpKey = `otp:value:${phoneNumber}`;

    // Store OTP in Redis (TTL 5 min) — value is the raw OTP (Redis is not git history)
    await this.redis.set(otpKey, otp, 'EX', OTP_TTL_SECONDS);
    await this.redis.set(attemptsKey, '0', 'EX', OTP_TTL_SECONDS);

    await this.sendSms(phoneNumber, otp);
    // Open the cooldown window only after a send actually went out (a failed send lets the user retry).
    if (!fixedOtp) await this.startResendCooldown(phoneNumber);

    // @pdpa: phone_number is PII — log as [REDACTED]
    logger.info({ phone: '[REDACTED]' }, 'OTP sent');
    // The client always applies the cooldown countdown; the E2E bypass only relaxes SERVER enforcement
    // (so suites can re-request via the API), not the advertised duration.
    return { expiresInSeconds: OTP_TTL_SECONDS, resendCooldownSeconds: RESEND_COOLDOWN_SECONDS };
  }

  /**
   * Reject a resend that arrives before the per-phone cooldown elapses, returning how many seconds are
   * left so the client can sync its countdown. HTTP 429, distinct from the daily-limit 429 by its
   * `retryAfterSeconds`.
   */
  private async enforceResendCooldown(phoneNumber: string): Promise<void> {
    const remaining = await this.redis.ttl(`otp:cooldown:${phoneNumber}`);
    if (remaining > 0) {
      throw new HttpException(
        {
          message: 'An OTP was sent recently — please wait before requesting a new one',
          retryAfterSeconds: remaining,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async startResendCooldown(phoneNumber: string): Promise<void> {
    await this.redis.set(`otp:cooldown:${phoneNumber}`, '1', 'EX', RESEND_COOLDOWN_SECONDS);
  }

  /**
   * Verify OTP — returns true on success, throws on failure/expiry/max attempts.
   *
   * The attempt budget is spent BEFORE the comparison, via a single atomic INCR (security review F6).
   * The previous order — read the counter, compare, then increment only on a miss — was a TOCTOU: N
   * concurrent requests all read the same pre-increment value, all passed the `attempts >= 3` check,
   * and all got to guess. That turned a 3-guess budget into "3 guesses per round trip of parallelism"
   * against a 6-digit space.
   *
   * INCR preserves the TTL requestOtp set on the key, so the budget still expires with the OTP.
   */
  async verifyOtp(phoneNumber: string, otp: string): Promise<boolean> {
    const attemptsKey = `otp:attempts:${phoneNumber}`;
    const otpKey = `otp:value:${phoneNumber}`;

    const storedOtp = await this.redis.get(otpKey);
    if (!storedOtp) {
      throw new BadRequestException('OTP expired or not requested');
    }

    // Claim this attempt atomically. A concurrent burst gets 1, 2, 3, 4… — exactly one request per
    // slot — so only OTP_MAX_ATTEMPTS of them ever reach the comparison below.
    const attempts = await this.redis.incr(attemptsKey);
    if (attempts > OTP_MAX_ATTEMPTS) {
      await this.redis.del(otpKey, attemptsKey);
      throw new HttpException(
        'Maximum OTP attempts exceeded — request a new OTP',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!otpMatches(otp, storedOtp)) {
      logger.warn({ phone: '[REDACTED]' }, 'OTP verification failed');
      throw new BadRequestException('Invalid OTP');
    }

    // Success — clear OTP from Redis
    await this.redis.del(otpKey, attemptsKey);
    return true;
  }

  private async enforceDailyLimit(phoneNumber: string): Promise<void> {
    const dailyKey = `otp:daily:${phoneNumber}:${new Date().toISOString().slice(0, 10)}`;
    const count = await this.redis.incr(dailyKey);
    if (count === 1) {
      await this.redis.expire(dailyKey, 86400); // 24h TTL
    }
    if (count > OTP_DAILY_LIMIT) {
      throw new HttpException('Daily OTP limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async sendSms(phoneNumber: string, otp: string): Promise<void> {
    // Delivery — including the dev-mode short-circuit — belongs to the adapter (ADR-040). This method
    // now owns only the message copy, which is a product concern, not a gateway one.
    await this.sms.sendSms(
      phoneNumber,
      `Your Construction OS verification code is: ${otp}. Valid for 5 minutes.`,
    );
  }
}
