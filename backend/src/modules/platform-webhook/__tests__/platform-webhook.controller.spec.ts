// Unit tests — PlatformWebhookController (Phase 25)
// Verifies header extraction (signature + replay-protection timestamp) and delegation.

const mockWebhookService = {
  handleEnterpriseContractSigned: jest.fn(),
};

import { PlatformWebhookController } from '../platform-webhook.controller';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('PlatformWebhookController', () => {
  let controller: PlatformWebhookController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PlatformWebhookController(mockWebhookService as never);
  });

  describe('enterpriseContractSigned', () => {
    it('extracts signature from headers and delegates to webhookService', async () => {
      const dto = { tenant_id: TENANT_ID, contract_reference: 'CRM-001' } as never;
      const rawBody = Buffer.from('{}', 'utf8');
      const req = {
        headers: { 'x-webhook-signature': 'sha256=abc123', 'x-webhook-timestamp': '1750000000000' },
        rawBody,
      } as never;
      const serviceResult = {
        message: 'Webhook accepted',
        workflowId: `enterprise-provisioning-${TENANT_ID}`,
        tenantId: TENANT_ID,
      };
      mockWebhookService.handleEnterpriseContractSigned.mockResolvedValue(serviceResult);

      const result = await controller.enterpriseContractSigned(dto, req);
      expect(mockWebhookService.handleEnterpriseContractSigned).toHaveBeenCalledWith(
        TENANT_ID,
        'CRM-001',
        'sha256=abc123',
        rawBody,
        '1750000000000',
      );
      expect(result).toBe(serviceResult);
    });

    it('passes empty string signature when x-webhook-signature header is absent', async () => {
      const dto = { tenant_id: TENANT_ID } as never;
      const rawBody = Buffer.from('{}', 'utf8');
      const req = { headers: {}, rawBody } as never;
      mockWebhookService.handleEnterpriseContractSigned.mockRejectedValue(
        new Error('Unauthorized'),
      );

      await expect(controller.enterpriseContractSigned(dto, req)).rejects.toThrow('Unauthorized');
      expect(mockWebhookService.handleEnterpriseContractSigned).toHaveBeenCalledWith(
        TENANT_ID,
        undefined,
        '',
        rawBody,
        '',
      );
    });

    it('passes undefined rawBody when request has no rawBody', async () => {
      const dto = { tenant_id: TENANT_ID } as never;
      const req = { headers: { 'x-webhook-signature': 'sha256=xyz' } } as never;
      mockWebhookService.handleEnterpriseContractSigned.mockResolvedValue({});

      await controller.enterpriseContractSigned(dto, req);
      expect(mockWebhookService.handleEnterpriseContractSigned).toHaveBeenCalledWith(
        TENANT_ID,
        undefined,
        'sha256=xyz',
        undefined,
        '',
      );
    });
  });
});
