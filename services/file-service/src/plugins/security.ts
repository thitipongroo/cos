// Security plugin — enforces QM-4 security headers on every response.
// Uses @fastify/helmet with Construction OS overrides.

import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';

export const securityPlugin = fp(async (app: FastifyInstance) => {
  await app.register(helmet, {
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: false,
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'none'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });
});
