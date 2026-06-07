// Unit tests — PlatformWebhookService (Phase 25)
// Tests HMAC signature verification and delegation to TenantService.

jest.mock('../../tenant/tenant.service');

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { PlatformWebhookService } from '../platform-webhook.service';
import { TenantService } from '../../tenant/tenant.service';

// ── Helpers ────────────────────────────────────────────────────────────────

function computeHmac(secret: string, body: string | Buffer): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHmac } = require('crypto') as typeof import('crypto');
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  return 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
}

const TEST_SECRET = 'test-webhook-secret-123';
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const WORKFLOW_ID = `enterprise-provisioning-${TENANT_ID}`;

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PlatformWebhookService', () => {
  let svc: PlatformWebhookService;
  let tenantService: jest.Mocked<TenantService>;

  beforeAll(() => {
    process.env['PLATFORM_WEBHOOK_SECRET'] = TEST_SECRET;
  });

  afterAll(() => {
    delete process.env['PLATFORM_WEBHOOK_SECRET'];
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformWebhookService,
        {
          provide: TenantService,
          useValue: {
            markAsEnterpriseContracted: jest.fn().mockResolvedValue({ workflowId: WORKFLOW_ID }),
          },
        },
      ],
    }).compile();

    svc = module.get(PlatformWebhookService);
    tenantService = module.get(TenantService) as jest.Mocked<TenantService>;
  });

  describe('handleEnterpriseContractSigned', () => {
    it('delegates to tenantService with valid signature', async () => {
      const body = JSON.stringify({ tenant_id: TENANT_ID });
      const rawBody = Buffer.from(body, 'utf8');
      const signature = computeHmac(TEST_SECRET, rawBody);

      const result = await svc.handleEnterpriseContractSigned(
        TENANT_ID,
        undefined,
        signature,
        rawBody,
      );

      expect(result).toEqual({
        message: 'Webhook accepted',
        workflowId: WORKFLOW_ID,
        tenantId: TENANT_ID,
      });
      expect(tenantService.markAsEnterpriseContracted).toHaveBeenCalledWith(
        TENANT_ID,
        undefined,
        'system',
      );
    });

    it('passes contractReference to tenantService', async () => {
      const rawBody = Buffer.from('{}', 'utf8');
      const signature = computeHmac(TEST_SECRET, rawBody);

      await svc.handleEnterpriseContractSigned(TENANT_ID, 'CRM-001', signature, rawBody);

      expect(tenantService.markAsEnterpriseContracted).toHaveBeenCalledWith(
        TENANT_ID,
        'CRM-001',
        'system',
      );
    });

    it('throws UnauthorizedException for invalid signature', async () => {
      const rawBody = Buffer.from('{}', 'utf8');
      await expect(
        svc.handleEnterpriseContractSigned(TENANT_ID, undefined, 'sha256=deadbeef', rawBody),
      ).rejects.toThrow(UnauthorizedException);
      expect(tenantService.markAsEnterpriseContracted).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when signature is missing', async () => {
      const rawBody = Buffer.from('{}', 'utf8');
      await expect(
        svc.handleEnterpriseContractSigned(TENANT_ID, undefined, '', rawBody),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws InternalServerErrorException when rawBody is undefined', async () => {
      const rawBody = Buffer.from('{}', 'utf8');
      const signature = computeHmac(TEST_SECRET, rawBody);
      await expect(
        svc.handleEnterpriseContractSigned(TENANT_ID, undefined, signature, undefined),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('throws InternalServerErrorException when PLATFORM_WEBHOOK_SECRET is not set', async () => {
      delete process.env['PLATFORM_WEBHOOK_SECRET'];
      const rawBody = Buffer.from('{}', 'utf8');
      await expect(
        svc.handleEnterpriseContractSigned(TENANT_ID, undefined, 'sha256=anything', rawBody),
      ).rejects.toThrow(InternalServerErrorException);
      process.env['PLATFORM_WEBHOOK_SECRET'] = TEST_SECRET;
    });
  });
});
