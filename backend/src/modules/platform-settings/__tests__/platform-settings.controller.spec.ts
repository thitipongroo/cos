// Unit tests for PlatformSettingsController — SYSTEM_ADMIN only, delegates to the service with the actor.

import { UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { PlatformSettingsController } from '../platform-settings.controller';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { defaultPlatformSettings } from '../platform-settings.types';

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const JUSTIFICATION = 'Primary gateway moved to the new endpoint (ticket OPS-6001).';

const service = { get: jest.fn(), update: jest.fn() };

describe('PlatformSettingsController', () => {
  let controller: PlatformSettingsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PlatformSettingsController(service as never);
  });

  it.each(['get', 'update'] as const)(
    '%s is guarded by JwtAuthGuard + RolesGuard for SYSTEM_ADMIN only',
    (name) => {
      const handler = PlatformSettingsController.prototype[name];
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([JwtAuthGuard, RolesGuard]);
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([CosRole.SYSTEM_ADMIN]);
    },
  );

  it('get returns the service response', async () => {
    const response = { version: 0 };
    service.get.mockResolvedValue(response);
    await expect(controller.get()).resolves.toBe(response);
  });

  it('update passes version, document, justification and the operator with their home tenant', async () => {
    const settings = defaultPlatformSettings();
    const response = { version: 1 };
    service.update.mockResolvedValue(response);

    const result = await controller.update(
      { version: 0, settings, justification: JUSTIFICATION } as never,
      { userId: USER, tenantId: TENANT } as never,
    );

    expect(result).toBe(response);
    expect(service.update).toHaveBeenCalledWith(0, settings, JUSTIFICATION, {
      userId: USER,
      tenantId: TENANT,
    });
  });

  it.each([
    ['no user id', { tenantId: TENANT }],
    ['no tenant id', { userId: USER }],
  ])(
    'update refuses with 401 when the request carries %s — never audits as "system"',
    async (_l, req) => {
      await expect(
        controller.update(
          { version: 0, settings: {}, justification: JUSTIFICATION } as never,
          req as never,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(service.update).not.toHaveBeenCalled();
    },
  );
});
