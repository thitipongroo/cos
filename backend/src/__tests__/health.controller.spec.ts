// Unit tests for HealthController

import { HealthController } from '../health.controller';

const mockHealthService = {
  check: jest.fn().mockResolvedValue({ status: 'ok', details: {} }),
};

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new HealthController(mockHealthService as never);
  });

  describe('liveness', () => {
    it('returns status ok', () => {
      const result = controller.liveness();
      expect(result.status).toBe('ok');
    });

    it('returns timestamp as ISO string', () => {
      const result = controller.liveness();
      expect(() => new Date(result.timestamp)).not.toThrow();
    });

    it('returns default version when npm_package_version is not set', () => {
      delete process.env['npm_package_version'];
      const result = controller.liveness();
      expect(result.version).toBe('0.1.0');
    });

    it('returns npm_package_version from env when set (covers ?? left branch)', () => {
      process.env['npm_package_version'] = '1.2.3';
      const result = controller.liveness();
      expect(result.version).toBe('1.2.3');
      delete process.env['npm_package_version'];
    });
  });

  describe('readiness', () => {
    it('delegates to health.check with empty indicators', async () => {
      const result = await controller.readiness();
      expect(mockHealthService.check).toHaveBeenCalledWith([]);
      expect(result).toEqual({ status: 'ok', details: {} });
    });
  });
});
