// Integration test skeleton — Phase 2 auth flow.
// Full tests run with testcontainers (PostgreSQL + Redis + Keycloak).
// Phase 18 adds complete integration test suite.

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth Integration (Phase 2 skeleton)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/health/live', () => {
    it('returns 200', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
        });
    });
  });

  describe('POST /api/v1/auth/otp/request', () => {
    it('rejects invalid phone number format', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phoneNumber: 'not-a-phone' })
        .expect(400);
    });

    it('accepts valid E.164 phone number', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phoneNumber: '+66812345678' })
        .expect(200)
        .expect((res) => {
          expect(res.body.expiresInSeconds).toBe(300);
        });
    });
  });

  describe('POST /api/v1/auth/otp/verify', () => {
    it('rejects OTP with wrong length', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ phoneNumber: '+66812345678', otp: '12345' }) // 5 digits — invalid
        .expect(400);
    });
  });

  // TODO Phase 18: add full lifecycle test with real Redis + testcontainers
  // - request OTP → verify with correct OTP → receive tokens
  // - verify tokens against Keycloak JWKS
  // - cross-tenant isolation: user in tenant A cannot access tenant B resources
});
