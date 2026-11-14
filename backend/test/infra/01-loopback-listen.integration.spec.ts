/**
 * The integration setup makes every app under test listen on 127.0.0.1 after init()
 * (helpers/integration-mocks.ts). Without it, supertest listen(0)s on `::` for each request and a
 * request can reach another process holding the same port on 127.0.0.1. No containers needed.
 */
import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { AddressInfo } from 'net';

@Controller()
class PingController {
  @Get('ping')
  ping(): string {
    return 'this-app';
  }
}

@Module({ controllers: [PingController] })
class PingModule {}

async function makeApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [PingModule] }).compile();
  return moduleRef.createNestApplication();
}

describe('integration setup: the app under test listens on 127.0.0.1', () => {
  it('after init(), the server is bound to 127.0.0.1 and supertest uses it', async () => {
    const app = await makeApp();
    await app.init();
    try {
      const server = app.getHttpServer() as import('http').Server;
      expect(server.listening).toBe(true);
      const addr = server.address() as AddressInfo;
      expect(addr.address).toBe('127.0.0.1');

      // Many requests, one address: supertest never calls listen(0) on an already-listening server.
      for (let i = 0; i < 50; i++) {
        const res = await request(server).get('/ping');
        expect(res.text).toBe('this-app');
      }
      expect((server.address() as AddressInfo).port).toBe(addr.port);
    } finally {
      await app.close();
    }
  });

  it('a suite that calls app.listen() itself still can (no double listen)', async () => {
    const app = await makeApp();
    await app.listen(0, '127.0.0.1');
    try {
      const res = await request(app.getHttpServer()).get('/ping');
      expect(res.text).toBe('this-app');
    } finally {
      await app.close();
    }
  });

  it('app.listen() after init() still works (the setup closes its own listen first)', async () => {
    const app = await makeApp();
    await app.init();
    await app.listen(0, '127.0.0.1');
    try {
      const res = await request(app.getHttpServer()).get('/ping');
      expect(res.text).toBe('this-app');
    } finally {
      await app.close();
    }
  });

  // Four suites build their app on Fastify (central-prices/01, security/02, provisioning/01,
  // auth-tenant/06): the same patch must hold there.
  it('a Fastify app is bound to 127.0.0.1 after init() too', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PingModule] }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    try {
      const server = app.getHttpServer() as import('http').Server;
      expect(server.listening).toBe(true);
      expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
      const res = await request(server).get('/ping');
      expect(res.text).toBe('this-app');
    } finally {
      await app.close();
    }
  });

  it('close() releases the server', async () => {
    const app = await makeApp();
    await app.init();
    const server = app.getHttpServer() as import('http').Server;
    await app.close();
    expect(server.listening).toBe(false);
  });
});
