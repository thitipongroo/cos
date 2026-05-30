// EP-WAF-001 — CloudflareWAFIntegration
// Mandatory middleware on every NestJS service (QM-4; Phase 16)
// Source: context/00_master_construction_os.md §Phase 16 WAF

import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { createLogger } from '@cos/logger';

const log = createLogger('cloudflare-waf');

@Injectable()
export class CloudflareWafMiddleware implements NestMiddleware {
  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void): void {
    const cfRay = (req.headers as Record<string, string | undefined>)['cf-ray'];
    const cfConnectingIp = (req.headers as Record<string, string | undefined>)['cf-connecting-ip'];

    // In production: reject requests without CF-Ray header (WAF not traversed)
    // In development: skip enforcement (no Cloudflare edge locally)
    if (process.env['NODE_ENV'] === 'production' && !cfRay) {
      log.warn({ url: req.url }, 'Request missing CF-Ray header — WAF bypass detected');
      res.statusCode = 403;
      res.end(JSON.stringify({ error: { code: 'COS-SEC-001', message: 'Forbidden' } }));
      return;
    }

    // Log CF-Ray for end-to-end request tracing (QM-8)
    if (cfRay) {
      log.info({ cfRay, cfConnectingIp, url: req.url }, 'WAF-validated request');
    }

    next();
  }
}
