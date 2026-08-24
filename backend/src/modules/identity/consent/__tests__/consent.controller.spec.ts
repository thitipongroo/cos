// Consent controller unit tests (ADR-079).
//
// The controller is deliberately thin, so what these assert is the part that would be a security bug
// if it drifted: both routes scope by the JWT's OWN tenant/user — never a value from the body or a
// path param — so a caller can only ever read or change their own decisions.

import { ConsentController } from '../consent.controller';
import type { ConsentService } from '../consent.service';
import type { NetworkOriginService } from '../../network-origin/network-origin.service';
import type { TenantRequest } from '../../../tenant/tenant.middleware';

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

const req = { tenantId: TENANT, userId: USER } as unknown as TenantRequest;

describe('ConsentController', () => {
  let service: jest.Mocked<Pick<ConsentService, 'getState' | 'record'>>;
  let networkOrigin: jest.Mocked<Pick<NetworkOriginService, 'describe'>>;
  let controller: ConsentController;

  beforeEach(() => {
    service = { getState: jest.fn(), record: jest.fn() } as unknown as jest.Mocked<
      Pick<ConsentService, 'getState' | 'record'>
    >;
    networkOrigin = { describe: jest.fn() } as unknown as jest.Mocked<
      Pick<NetworkOriginService, 'describe'>
    >;
    controller = new ConsentController(
      service as unknown as ConsentService,
      networkOrigin as unknown as NetworkOriginService,
    );
  });

  describe('GET me/network-origin', () => {
    it('uses the REQUEST’s ip, never one the caller could supply', async () => {
      // A caller-chosen address would make this a general-purpose geo-IP lookup service for anyone
      // holding a session, rather than a transparency view of their own record.
      const panel = { origin: null, behavioral: null, rule: {} };
      networkOrigin.describe.mockResolvedValue(panel as never);

      await expect(controller.getNetworkOrigin(req, '203.0.113.7')).resolves.toBe(panel);
      expect(networkOrigin.describe).toHaveBeenCalledWith({
        tenantId: TENANT,
        userId: USER,
        ipAddress: '203.0.113.7',
      });
    });
  });

  it('GET me/consents reads the caller’s own state', async () => {
    const state = [{ category: 'location' }];
    service.getState.mockResolvedValue(state as never);
    await expect(controller.getState(req)).resolves.toBe(state);
    expect(service.getState).toHaveBeenCalledWith(TENANT, USER);
  });

  it('POST me/consents records against the JWT identity, not anything in the body', async () => {
    service.record.mockResolvedValue(undefined);
    await controller.record(req, {
      purpose: 'location',
      granted: true,
      notice_version: '1.0.0',
    });
    expect(service.record).toHaveBeenCalledWith({
      tenantId: TENANT,
      userId: USER,
      purpose: 'location',
      granted: true,
      noticeVersion: '1.0.0',
    });
  });

  it('passes a withdrawal through unchanged', async () => {
    service.record.mockResolvedValue(undefined);
    await controller.record(req, {
      purpose: 'financial',
      granted: false,
      notice_version: '1.0.0',
    });
    expect(service.record).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'financial', granted: false }),
    );
  });
});
