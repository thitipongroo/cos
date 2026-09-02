// CredentialService (W3C DID/VC) — Fastify ESM microservice (ADR-019).
// First ESM service in the repo: runs the @digitalbazaar stack natively. The backend calls it over
// REST (like file-service). See services/credential-service/README when routes land (CS-8).
import 'dotenv/config';
import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
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

  // Health first, so the probe is never throttled by the limiter registered below it (file-service
  // orders it the same way and for the same reason).
  app.get('/health', async () => ({ status: 'ok', service: 'credential-service' }));

  // ── App-layer rate limit (QM-7, defence-in-depth behind Kong) ──────────────────────────────────
  //
  // This service had NO rate limit of any kind until 2026-09-03, while file-service — which holds
  // uploaded documents — has had one since it was written. This one holds every tenant's AES-256-GCM
  // encrypted issuer private keys, and two of its routes are unauthenticated by design.
  //
  // The gap mattered most on the two public GETs. `did.json` and the Status List are fetched by
  // third-party verifiers with no platform identity, so they are reachable by anyone who knows a
  // tenant id, and each one costs a tenant-scoped database round trip. §5.9.8 records the mitigation
  // as "IP-rate-limited", which was true only of the Kong route — and Kong is deployed nowhere
  // (`plugins/jwt-verify.ts` says so, and it is the same reason the auth hook stopped trusting
  // gateway headers). Nothing between a caller and the database was counting.
  //
  // 100 req/min is the §5.5 general limit, not a number chosen here. Keyed per authenticated user
  // and falling back to IP, which is what the unauthenticated public routes resolve to.
  //
  // Registered AFTER registerAuth so `request.userId` is already populated when the key is computed;
  // on a public route the auth hook returns early and the key falls back to `request.ip`, which is
  // the intended behaviour rather than a gap.
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.userId || request.ip,
  });

  await credentialRoutes(app);
  return { app, config };
}

// Bootstrap only when executed directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  const { app, config } = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
}
