// Guards for `GET /api/v1/auth/identity` — the identity file-service, credential-service and ai-gateway take
// instead of token claims (ADR-107). Applied in this order: InternalOnlyGuard → ServiceIdentityAuthGuard →
// IdentityThrottlerGuard.

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createLogger } from '@cos/logger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { isInternalRequest } from '../../../shared/net/internal-listener';
import type { AuthenticatedUser } from '../../../shared/context/jwt-payload';

const logger = createLogger('service-identity');

/**
 * The route exists only on the internal listener. On the public port it answers exactly like a route that
 * does not exist — the edge has no reason to learn it is there.
 */
@Injectable()
export class InternalOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!isInternalRequest(context.switchToHttp().getRequest())) {
      throw new NotFoundException();
    }
    return true;
  }
}

/**
 * Failures that say the TOKEN is wrong, not that the backend could not check it. passport-jwt 4.0.1 reports a
 * key-provider rejection and a verification error alike through `fail(err)` (lib/strategy.js), so both reach
 * `handleRequest` as `info` with no user — the error's class is the only thing that tells them apart:
 *   - UnauthorizedException — KeycloakJwtStrategy.resolveSigningKey refusing a non-Keycloak or untrusted issuer
 *   - JsonWebTokenError / TokenExpiredError / NotBeforeError — jsonwebtoken 9.0.3 verification
 *   - SigningKeyNotFoundError — jwks-rsa: no key with that `kid` (a forged or rotated-away token)
 *   - "No auth token" — passport-jwt, no bearer at all
 * Anything else — JwksError, JwksRateLimitError, a network error, a database error in the realm allowlist —
 * is the backend failing, and a service must not tell a user their token is bad because Keycloak is down.
 */
const TOKEN_FAULT_NAMES = new Set([
  'JsonWebTokenError',
  'TokenExpiredError',
  'NotBeforeError',
  'SigningKeyNotFoundError',
]);

export function isTokenFault(info: unknown): boolean {
  if (info === undefined || info === null) return true;
  if (info instanceof UnauthorizedException) return true;
  if (!(info instanceof Error)) return true;
  return TOKEN_FAULT_NAMES.has(info.name) || info.message === 'No auth token';
}

/**
 * JwtAuthGuard, with one difference: an authentication that failed because the backend could not check the
 * token is a 503, not a 401. A database error inside `validate()` already surfaces as a 5xx (passport
 * `error()`); an MFA refusal keeps its own 403 COS-AUTH-001.
 */
@Injectable()
export class ServiceIdentityAuthGuard extends JwtAuthGuard {
  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (!err && !user && !isTokenFault(info)) {
      logger.error(
        // isTokenFault answered false, so `info` is an Error.
        { reason: `${(info as Error).name}: ${(info as Error).message}` },
        'service-identity.unavailable — token could not be checked',
      );
      throw new ServiceUnavailableException({
        error: {
          code: 'COS-AUTH-004',
          message: 'Identity could not be verified right now — try again',
          messageKey: 'auth.identity.unavailable',
        },
      });
    }
    return super.handleRequest(err, user, info, context);
  }
}

/** Requests per minute per verified user on this route (product-owner figure, revision R8). */
export const IDENTITY_LIMIT_PER_MINUTE = 600;
const IDENTITY_TTL_MS = 60_000;

/**
 * A rate limit keyed on the VERIFIED user, not the address. Every call from one service pod shares its
 * address, so the global address-keyed limit (skipped on this route) would refuse legitimate traffic; keyed
 * on the user, one account still cannot call without limit.
 *
 * Runs after ServiceIdentityAuthGuard, so `req.user` is the strategy's answer. It calls ThrottlerGuard's protected
 * `handleRequest` directly (@nestjs/throttler 6.5.0 dist/throttler.guard.js) rather than `canActivate`, which
 * would honour the route's @SkipThrottle and do nothing. `ignoreUserAgents` and `setHeaders` are given on the
 * throttler itself so `handleRequest` never falls back to `commonOptions`, which only `onModuleInit` builds.
 */
@Injectable()
export class IdentityThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const userId = (context.switchToHttp().getRequest() as { user?: AuthenticatedUser }).user
      ?.user_id;
    if (!userId) throw new UnauthorizedException();
    return this.handleRequest({
      context,
      limit: IDENTITY_LIMIT_PER_MINUTE,
      ttl: IDENTITY_TTL_MS,
      blockDuration: IDENTITY_TTL_MS,
      throttler: {
        name: 'service-identity',
        limit: IDENTITY_LIMIT_PER_MINUTE,
        ttl: IDENTITY_TTL_MS,
        ignoreUserAgents: [],
        setHeaders: true,
      },
      getTracker: async () => `user:${userId}`,
      generateKey: (ctx, tracker, name) => this.generateKey(ctx, tracker, name),
    });
  }
}
