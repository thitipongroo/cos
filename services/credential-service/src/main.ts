// CredentialService (W3C DID/VC) — Fastify ESM microservice (ADR-019).
// First ESM service in the repo: runs the @digitalbazaar stack natively. The backend calls it over
// REST (like file-service). See services/credential-service/README when routes land (CS-8).
import 'dotenv/config';
import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { loadConfig, type CredentialServiceConfig } from './config.js';
import { createPool } from './db.js';
import { registerTrace } from './plugins/trace.js';
import { registerAuth } from './plugins/auth.js';
import { credentialRoutes } from './routes/credentials.routes.js';
import type { Pool } from 'pg';
import './types.js';

export async function buildApp(
  pool?: Pool,
): Promise<{ app: FastifyInstance; config: CredentialServiceConfig }> {
  const config = loadConfig();
  const app = Fastify({ logger: false, trustProxy: true });
  app.decorate('config', config);
  app.decorate('pool', pool ?? createPool(config.database.url));
  await app.register(helmet);
  await app.register(cors, { origin: false }); // Kong handles origins
  registerTrace(app);
  registerAuth(app);
  app.get('/health', async () => ({ status: 'ok', service: 'credential-service' }));
  await credentialRoutes(app);
  return { app, config };
}

// Bootstrap only when executed directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  const { app, config } = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
}
