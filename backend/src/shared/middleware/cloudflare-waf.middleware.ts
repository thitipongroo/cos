// EP-WAF-001 — CloudflareWAFIntegration
// Mandatory middleware on every NestJS service (QM-4; Phase 16)
// Source: context/00_master_construction_os.md §Phase 16 WAF
//
// Two layers, because the original one was not a control at all:
//
//   1. CF-Ray presence (production). Kept for continuity, but understand its limit: `CF-Ray` is just
//      a request HEADER. Anyone who can reach the origin directly sends `CF-Ray: anything` and passes.
//      It detects a misrouted request, never an attacker deliberately bypassing the edge.
//   2. Peer-address allowlist. The TCP peer address cannot be forged by the client the way a header
//      can, so this is the layer that actually binds traffic to the edge. Checked against
//      TRUSTED_PROXY_CIDRS (Cloudflare's published ranges, or your ingress/mesh hop).
//
// The allowlist is behind a rollout gate — the same staged shape the codebase already uses for
// MFA_ENFORCE and WEBHOOK_REPLAY_PROTECTION. Default OFF, logging a warning once per process, because
// switching it on before TRUSTED_PROXY_CIDRS matches the real topology would 403 all live traffic.
// Set WAF_ORIGIN_ENFORCE=true once the ranges are confirmed against a staging deploy.

import { Injectable, NestMiddleware } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '@cos/logger';
import { ipInAnyCidr, parseCidrList } from '../net/cidr-match';

const log = createLogger('cloudflare-waf');

function originEnforcementEnabled(): boolean {
  return (process.env['WAF_ORIGIN_ENFORCE'] ?? 'false').toLowerCase() === 'true';
}

function trustedProxyCidrs(): string[] {
  return parseCidrList(process.env['TRUSTED_PROXY_CIDRS']);
}

@Injectable()
export class CloudflareWafMiddleware implements NestMiddleware {
  /** Warn once per process, not once per request — this is a config state, not a per-request event. */
  private warnedUnenforced = false;

  use(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    const cfRay = (req.headers as Record<string, string | undefined>)['cf-ray'];

    // Layer 1 — in production: reject requests without CF-Ray (WAF not traversed).
    // In development: skip enforcement (no Cloudflare edge locally).
    if (process.env['NODE_ENV'] === 'production' && !cfRay) {
      log.warn({ url: req.url }, 'Request missing CF-Ray header — WAF bypass detected');
      this.deny(res);
      return;
    }

    // Layer 2 — the peer address must belong to the trusted edge. `req.socket.remoteAddress` is the
    // real TCP peer; deliberately NOT `cf-connecting-ip` / `x-forwarded-for`, which are attacker
    // -supplied headers and would make this check self-defeating.
    if (originEnforcementEnabled()) {
      const cidrs = trustedProxyCidrs();
      const peer = req.socket?.remoteAddress ?? '';
      if (cidrs.length === 0 || !ipInAnyCidr(peer, cidrs)) {
        // No peer address in the log line: it is the caller's IP, i.e. personal data under PDPA.
        // ip_address is recorded in platform.audit_logs only (cf. audit.interceptor.ts).
        log.warn(
          { url: req.url, configuredRanges: cidrs.length },
          'waf.origin.denied — peer address is not within TRUSTED_PROXY_CIDRS',
        );
        this.deny(res);
        return;
      }
    } else if (!this.warnedUnenforced) {
      this.warnedUnenforced = true;
      log.warn(
        'waf.origin.unenforced — origin reachability is guarded only by the forgeable CF-Ray ' +
          'header; set TRUSTED_PROXY_CIDRS and WAF_ORIGIN_ENFORCE=true to bind traffic to the edge',
      );
    }

    // Previously this logged cf-connecting-ip at info level on EVERY request, putting the caller's
    // IP — personal data — into the application log stream, which is exactly what QM-8 and the
    // @pdpa note in audit.interceptor.ts rule out. cf-ray alone is the trace correlator (QM-8).
    if (cfRay) {
      log.debug({ cfRay, url: req.url }, 'WAF-validated request');
    }

    next();
  }

  private deny(res: ServerResponse): void {
    res.statusCode = 403;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: { code: 'COS-SEC-001', message: 'Forbidden' } }));
  }
}
