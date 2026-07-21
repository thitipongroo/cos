import type { Pool } from 'pg';
import type { CredentialServiceConfig } from './config.js';

// Fastify augmentation — identity is forwarded by Kong (JWT validated at ingress), same as file-service.
declare module 'fastify' {
  interface FastifyInstance {
    config: CredentialServiceConfig;
    pool: Pool;
  }
  interface FastifyRequest {
    tenantId: string;
    userId: string;
    userRole: string;
    traceId: string;
  }
}

export {};
