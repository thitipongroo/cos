// Unit tests — Tenant Settings Controller (Phase 2)
import { TenantSettingsController } from '../settings.controller';

const mockSvc = { getSettings: jest.fn(), updateSettings: jest.fn() };

describe('TenantSettingsController', () => {
  let ctrl: TenantSettingsController;

  beforeEach(() => {
    jest.clearAllMocks();
    ctrl = new TenantSettingsController(mockSvc as never);
  });

  it('get delegates to svc.getSettings', () => {
    ctrl.get();
    expect(mockSvc.getSettings).toHaveBeenCalled();
  });

  it('update delegates to svc.updateSettings', () => {
    const dto = { variance_alert_threshold: 12 };
    ctrl.update(dto as never);
    expect(mockSvc.updateSettings).toHaveBeenCalledWith(dto);
  });
});
