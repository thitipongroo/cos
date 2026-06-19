// Unit tests — Tenant Settings Service (Phase 2)
import { Test, TestingModule } from '@nestjs/testing';
import { TenantSettingsService } from '../settings.service';
import { TenantSettingsRepository } from '../settings.repository';

const mockRepo = { find: jest.fn(), upsert: jest.fn() };

const row = {
  tenant_id: 'tenant-1',
  variance_alert_threshold: '10.00',
  retention_percentage: '5.00',
  line_channel_token: 'existing-token',
  notifications_enabled: true,
};

let service: TenantSettingsService;

beforeEach(async () => {
  jest.clearAllMocks();
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [TenantSettingsService, { provide: TenantSettingsRepository, useValue: mockRepo }],
  }).compile();
  service = moduleRef.get<TenantSettingsService>(TenantSettingsService);
});

it('getSettings returns the row when present', async () => {
  mockRepo.find.mockResolvedValue(row);
  expect(await service.getSettings()).toEqual({
    variance_alert_threshold: '10.00',
    retention_percentage: '5.00',
    line_channel_token: 'existing-token',
    notifications_enabled: true,
  });
});

it('getSettings returns defaults when no row exists', async () => {
  mockRepo.find.mockResolvedValue(null);
  expect(await service.getSettings()).toEqual({
    variance_alert_threshold: '10.00',
    retention_percentage: '5.00',
    line_channel_token: null,
    notifications_enabled: true,
  });
});

it('updateSettings applies all provided fields (formats decimals to 2dp)', async () => {
  mockRepo.find.mockResolvedValue(row);
  mockRepo.upsert.mockResolvedValue({ ...row, variance_alert_threshold: '15.00' });
  await service.updateSettings({
    variance_alert_threshold: 15,
    retention_percentage: 8,
    line_channel_token: 'new-token',
    notifications_enabled: false,
  });
  expect(mockRepo.upsert).toHaveBeenCalledWith({
    variance_alert_threshold: '15.00',
    retention_percentage: '8.00',
    line_channel_token: 'new-token',
    notifications_enabled: false,
  });
});

it('updateSettings keeps current values for omitted fields', async () => {
  mockRepo.find.mockResolvedValue(row);
  mockRepo.upsert.mockResolvedValue(row);
  await service.updateSettings({});
  expect(mockRepo.upsert).toHaveBeenCalledWith({
    variance_alert_threshold: '10.00',
    retention_percentage: '5.00',
    line_channel_token: 'existing-token',
    notifications_enabled: true,
  });
});
