/**
 * GET /api/v1/auth/identity on the INTERNAL listener (ADR-107, revision R8).
 *
 * The strategy's checks behind this route (realm and subject binding, active user, database role) are proved
 * against a real database in 04-shared-realm. ServiceIdentityAuthGuard is doubled here, as JwtAuthGuard is in
 * every HTTP integration file, because no Keycloak runs. What only this file can prove, with the REAL
 * AppModule on the REAL Fastify adapter and the real ThrottlerGuard/Redis:
 *
 *   1. with NODE_ENV=production and no CF-Ray header — the state that made every in-cluster call a 403 on the
 *      public port — the route answers on the internal listener;
 *   2. the same request to the public port is a 404: the route is not reachable from the edge;
 *   3. the address-keyed throttle does not apply there, while a sibling /auth route on the public port still
 *      has its own.
 */
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'mock-msg-id' }),
  })),
  PublishCommand: jest.fn(),
}));

import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:net';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';
import { ServiceIdentityAuthGuard } from '../../src/modules/identity/service-identity/service-identity.guards';
import { closeServer, startInternalListener } from '../../src/shared/net/internal-listener';

const TENANT_ID = 'dddddddd-1111-4000-8000-000000000107';
const USER_ID = 'dddddddd-2222-4000-8000-000000000107';

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((r) => probe.close(() => r()));
  return port;
}

describe('GET /api/v1/auth/identity — internal listener only (ADR-107, R8)', () => {
  let infra: IntegrationInfra;
  let app: NestFastifyApplication;
  let internal: Server;
  let publicBase = '';
  let internalBase = '';
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalInternalPort = process.env['INTERNAL_PORT'];

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    const guard = clsAuthGuard(() => ({
      tenant_id: TENANT_ID,
      user_id: USER_ID,
      // What KeycloakJwtStrategy.validate returns after ADR-077 overwrote the token's own role.
      role: 'PROJECT_MANAGER',
      tenantCode: 'sd-adr-107',
    }));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ServiceIdentityAuthGuard)
      .useValue(guard)
      .overrideGuard(JwtAuthGuard)
      .useValue(guard)
      .compile();

    process.env['INTERNAL_PORT'] = String(await freePort());
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    internal = await startInternalListener(app);
    publicBase = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    internalBase = `http://127.0.0.1:${process.env['INTERNAL_PORT']}`;

    // After boot, before any request: CloudflareWafMiddleware reads NODE_ENV per request.
    process.env['NODE_ENV'] = 'production';
  });

  afterAll(async () => {
    process.env['NODE_ENV'] = originalNodeEnv;
    if (originalInternalPort === undefined) delete process.env['INTERNAL_PORT'];
    else process.env['INTERNAL_PORT'] = originalInternalPort;
    await closeServer(internal);
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  it('answers on the internal listener in production with no CF-Ray', async () => {
    const res = await fetch(`${internalBase}/api/v1/auth/identity`, {
      headers: { authorization: 'Bearer any' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tenant_id: TENANT_ID,
      user_id: USER_ID,
      role: 'PROJECT_MANAGER',
    });
    expect(res.headers.get('x-ratelimit-limit-service-identity')).toBe('600');
  });

  it('serves no other route on the internal listener', async () => {
    const res = await fetch(`${internalBase}/api/v1/auth/roles/SITE_WORKER/permissions`, {
      headers: { authorization: 'Bearer any' },
    });
    expect(res.status).toBe(404);
  });

  it('is refused on the public port — by the WAF before it could even be a 404', async () => {
    const res = await fetch(`${publicBase}/api/v1/auth/identity`, {
      headers: { authorization: 'Bearer any' },
    });
    expect(res.status).toBe(403);
  });

  it('is a 404 on the public port once past the WAF', async () => {
    const res = await fetch(`${publicBase}/api/v1/auth/identity`, {
      headers: { authorization: 'Bearer any', 'cf-ray': 'test-SIN' },
    });
    expect(res.status).toBe(404);
  });

  it('is not address-throttled on the internal listener, while a public /auth route is', async () => {
    const identity: number[] = [];
    for (let i = 0; i < 15; i++) {
      identity.push(
        (
          await fetch(`${internalBase}/api/v1/auth/identity`, {
            headers: { authorization: 'Bearer any' },
          })
        ).status,
      );
    }
    expect(identity.every((s) => s === 200)).toBe(true);

    const sibling: number[] = [];
    for (let i = 0; i < 15; i++) {
      sibling.push(
        (
          await fetch(`${publicBase}/api/v1/auth/roles/SITE_WORKER/permissions`, {
            headers: { authorization: 'Bearer any', 'cf-ray': 'test-SIN' },
          })
        ).status,
      );
    }
    expect(sibling).toContain(429);
  });
});
