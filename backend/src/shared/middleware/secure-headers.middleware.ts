import { Injectable, NestMiddleware } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'http';

// Secure HTTP response headers per spec §Phase 16
// Source: context/00_master_construction_os.md §Phase 16 Secure Headers
const HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-XSS-Protection': '0',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
};

@Injectable()
export class SecureHeadersMiddleware implements NestMiddleware {
  use(_req: IncomingMessage, res: ServerResponse, next: () => void): void {
    for (const [key, value] of Object.entries(HEADERS)) {
      res.setHeader(key, value);
    }
    next();
  }
}
