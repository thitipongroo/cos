// OptionalJwtAuthGuard — authenticate when a usable bearer token is present, stay anonymous otherwise.
//
// For endpoints that must serve BOTH pre-login and logged-in callers. GET /api/v1/flags is the case
// this exists for: the login screen itself reads `s1.identity.sms-otp-login` before any token exists,
// so a hard JwtAuthGuard would lock the app out of its own sign-in path — but the endpoint previously
// had NO guard at all, which meant req.userId/req.tenantId were undefined even for authenticated
// callers and every flag was evaluated against an empty Unleash context.
//
// Semantics: never rejects. A missing, malformed, expired or MFA-blocked token yields an anonymous
// request rather than a 401 — the caller simply gets default-context flags. That is deliberate: this
// guard must only ever ADD context, never become a new way for a flag fetch to fail. Do NOT reuse it
// on an endpoint that returns tenant data; there, failing closed is the whole point.

import { ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  override handleRequest<TUser>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    // No token, or passport rejected it — proceed as an anonymous caller.
    if (err || !user) {
      return undefined as TUser;
    }
    try {
      // Valid token: run the full parent path so CLS tenant context and the last-seen touch still
      // happen exactly as they do on a normally guarded route.
      return super.handleRequest(err, user, info, context);
    } catch {
      // The parent rejected an otherwise-valid token (e.g. the MFA gate). Degrade to anonymous
      // rather than failing the request — see the note above on why this endpoint must not 401.
      return undefined as TUser;
    }
  }
}
