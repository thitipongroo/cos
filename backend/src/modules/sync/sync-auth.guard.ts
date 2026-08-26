// SyncAuthGuard — applies the REST layer's role matrix to the offline-sync surface (§17.5).
//
// The sync routes cannot express their requirement as a static `@Roles(...)` decorator: the entity
// type arrives in the request body (`push`/`resolve`) or the query string (`delta`), so the required
// roles are only known per request. This guard resolves them from sync-authz.ts and defers the actual
// role test to RolesGuard.hasAnyRole, which owns the primary-plus-additional union semantics.
//
// Two different failure modes, deliberately:
//
//   push/resolve — a single entity type per request. Wrong role → 403. Same answer the equivalent
//                  REST route gives.
//   delta        — the mobile client asks for ALL six types in one call (apps/mobile/src/sync/
//                  runDeltaSync.ts), so 403-ing the whole request because one type is out of reach
//                  would break sync outright for any role that cannot read every type — a SITE_WORKER
//                  cannot read safety incidents, and sync is their primary surface. The request is
//                  therefore NARROWED to the readable types rather than rejected, and what was
//                  dropped is logged: silently returning fewer types must not read as "you got
//                  everything".
//
// Must run AFTER JwtAuthGuard — it reads req.user.

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { createLogger } from '@cos/logger';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { CLS_SYNC_ALLOWED_ENTITY_TYPES } from '../../shared/context/cls-context';
import { JwtPayload } from '../../shared/context/jwt-payload';
import { PUSH_ROLES, DELTA_ROLES } from './sync-authz';

const logger = createLogger('sync-auth-guard');

interface SyncRequest {
  method?: string;
  user?: JwtPayload;
  body?: { entity_type?: unknown };
  query?: Record<string, unknown>;
}

/** Read the requested entity types off the query string — mirrors SyncController.delta's parsing. */
function requestedTypes(query: Record<string, unknown> | undefined): string[] {
  const raw = query?.['entity_types[]'] ?? query?.['entity_types'];
  if (raw == null) return [];
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

@Injectable()
export class SyncAuthGuard implements CanActivate {
  constructor(
    private readonly roles: RolesGuard,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<SyncRequest>();
    const user = req.user;
    if (!user?.role) {
      throw new ForbiddenException('Missing role claim in JWT');
    }

    // GET is `delta`; POST is `push`/`resolve`. Discriminating on the verb rather than the handler
    // name keeps this correct if a handler is ever renamed.
    return req.method === 'GET' ? this.authorizeDelta(req, user) : this.authorizePush(req, user);
  }

  /** push/resolve — one entity type, all-or-nothing, same as the equivalent REST route. */
  private async authorizePush(req: SyncRequest, user: JwtPayload): Promise<boolean> {
    // The guard runs before ValidationPipe, so entity_type is still unvalidated input. An unknown
    // type is left to SyncService, which answers 400 "Unknown entity_type" — a type with no handler
    // reaches no data, so there is nothing to protect and 400 is the more useful answer than 403.
    const entityType = typeof req.body?.entity_type === 'string' ? req.body.entity_type : '';
    const required = Object.hasOwn(PUSH_ROLES, entityType) ? PUSH_ROLES[entityType] : undefined;
    if (!required) return true;

    if (await this.roles.hasAnyRole(user, required)) return true;

    logger.warn(
      { userId: user.user_id, entityType, actualRole: user.role, requiredRoles: required },
      'sync.push denied — insufficient role',
    );
    throw new ForbiddenException(
      `Role '${user.role}' cannot push '${entityType}'. Required: ${required.join(' | ')}`,
    );
  }

  /** delta — narrow the requested types to the readable subset; publish it for SyncService. */
  private async authorizeDelta(req: SyncRequest, user: JwtPayload): Promise<boolean> {
    const requested = requestedTypes(req.query);
    const allowed: string[] = [];
    const denied: string[] = [];

    for (const type of requested) {
      const required = Object.hasOwn(DELTA_ROLES, type) ? DELTA_ROLES[type] : undefined;
      // No entry = no role requirement beyond authentication (e.g. `attendance`, which
      // 14-api-architecture marks "Any role"). Unknown types fall through here too and are
      // discarded later by SyncService's registry lookup.
      if (!required || (await this.roles.hasAnyRole(user, required))) {
        allowed.push(type);
      } else {
        denied.push(type);
      }
    }

    if (denied.length > 0) {
      logger.warn(
        { userId: user.user_id, actualRole: user.role, denied, allowed },
        'sync.delta narrowed — entity types dropped for insufficient role',
      );
    }

    if (this.cls.isActive()) {
      this.cls.set(CLS_SYNC_ALLOWED_ENTITY_TYPES, allowed);
    }
    return true;
  }
}
