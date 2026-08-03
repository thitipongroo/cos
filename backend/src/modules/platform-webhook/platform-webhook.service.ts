import { Injectable, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { createLogger } from '@cos/logger';
import { TenantService } from '../tenant/tenant.service';

const logger = createLogger('platform-webhook');

// How far a stamped webhook may be from our clock before it is treated as a replay. Covers ordinary
// clock skew and delivery latency without leaving a usefully wide window.
const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Replay protection rollout gate, mirroring MFA_ENFORCE (shared/guards/mfa-enforcement.ts).
 *
 * The HMAC alone proves authenticity but not freshness: a captured request stayed valid forever and
 * could re-trigger enterprise provisioning on every replay. Binding a timestamp into the signature
 * fixes that, but it is a contract change — the SENDER must start emitting X-Webhook-Timestamp and
 * signing `timestamp.body`. Until it does, enforcing would reject every real delivery.
 *
 * So: default OFF, log a WARN on every unstamped request, and let ops switch it on once the sender
 * is updated. Same staged-rollout shape the codebase already uses for MFA.
 */
function replayProtectionEnabled(): boolean {
  return (process.env['WEBHOOK_REPLAY_PROTECTION'] ?? 'false').toLowerCase() === 'true';
}

@Injectable()
export class PlatformWebhookService {
  constructor(private readonly tenantService: TenantService) {}

  async handleEnterpriseContractSigned(
    tenantId: string,
    contractReference: string | undefined,
    signature: string,
    rawBody: Buffer | undefined,
    timestamp = '',
  ): Promise<{ message: string; workflowId: string; tenantId: string }> {
    this.verifyHmacSignature(signature, rawBody, timestamp);
    const result = await this.tenantService.markAsEnterpriseContracted(
      tenantId,
      contractReference,
      'system',
    );
    return {
      message: 'Webhook accepted',
      workflowId: result.workflowId,
      tenantId,
    };
  }

  private verifyHmacSignature(
    signature: string,
    rawBody: Buffer | undefined,
    timestamp: string,
  ): void {
    const secret = process.env['PLATFORM_WEBHOOK_SECRET'];
    if (!secret) throw new InternalServerErrorException('Webhook secret not configured');
    if (!signature) throw new UnauthorizedException('Missing X-Webhook-Signature header');
    if (!rawBody)
      throw new InternalServerErrorException(
        'Raw body unavailable — check server rawBody configuration',
      );

    const stamped = this.checkTimestamp(timestamp);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHmac, timingSafeEqual } = require('crypto') as typeof import('crypto');
    // A stamped request signs `timestamp.body` so the timestamp cannot be edited independently of
    // the signature. An unstamped one keeps the legacy body-only form (see the rollout gate above).
    const signedPayload = stamped
      ? Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), rawBody])
      : rawBody;
    const expected = 'sha256=' + createHmac('sha256', secret).update(signedPayload).digest('hex');
    const sigBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  /**
   * Validate X-Webhook-Timestamp. Returns true when the request is stamped (and therefore signs
   * timestamp + body), false when it is legacy-unstamped and enforcement is still off.
   */
  private checkTimestamp(timestamp: string): boolean {
    if (!timestamp) {
      if (replayProtectionEnabled()) {
        throw new UnauthorizedException('Missing X-Webhook-Timestamp header');
      }
      logger.warn(
        'webhook.replay-protection.unstamped — request has no X-Webhook-Timestamp; it can be ' +
          'replayed indefinitely (enforcement disabled: WEBHOOK_REPLAY_PROTECTION!=true)',
      );
      return false;
    }

    // Accept both epoch milliseconds and an ISO-8601 instant.
    const parsed = /^\d+$/.test(timestamp) ? Number(timestamp) : Date.parse(timestamp);
    if (!Number.isFinite(parsed)) {
      throw new UnauthorizedException('Malformed X-Webhook-Timestamp header');
    }
    // Absolute skew — a timestamp far in the FUTURE is as suspect as one far in the past.
    if (Math.abs(Date.now() - parsed) > REPLAY_WINDOW_MS) {
      throw new UnauthorizedException('Webhook timestamp outside the accepted window');
    }
    return true;
  }
}
