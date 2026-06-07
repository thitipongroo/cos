// Unit tests — WhtService (Phase 7)
// Verifies: correct WHT calculation using wht_rules table, NotFoundException for missing rules.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { NotFoundException } from '@nestjs/common';
import { Decimal } from '@cos/financial';
import { WhtService } from '../wht.service';
import type { WhtRuleRow } from '../finance.repository';

// ── Mock Repository ─────────────────────────────────────────────────────────

const mockFindWhtRule = jest.fn();
const mockRepo = { findWhtRule: mockFindWhtRule };

// ── Fixtures ────────────────────────────────────────────────────────────────

const thServicesRule: WhtRuleRow = {
  rule_id: 'rule-uuid-001',
  tenant_id: 'tenant-uuid-001',
  jurisdiction_code: 'TH',
  service_type: 'services',
  rate: '3.00',
  is_active: true,
};

const thRentRule: WhtRuleRow = {
  rule_id: 'rule-uuid-002',
  tenant_id: 'tenant-uuid-001',
  jurisdiction_code: 'TH',
  service_type: 'rent',
  rate: '5.00',
  is_active: true,
};

// ── Setup ───────────────────────────────────────────────────────────────────

let svc: WhtService;

beforeEach(() => {
  jest.clearAllMocks();
  svc = new WhtService(mockRepo as never);
});

// ── calculate ───────────────────────────────────────────────────────────────

describe('calculate', () => {
  it('returns correct whtAmount for TH services (3%)', async () => {
    mockFindWhtRule.mockResolvedValue(thServicesRule);
    const result = await svc.calculate(new Decimal('100000'), 'services', 'TH');

    expect(result.rate).toBe(3);
    expect(result.whtAmount.toFixed(4)).toBe('3000.0000');
  });

  it('returns correct whtAmount for TH rent (5%)', async () => {
    mockFindWhtRule.mockResolvedValue(thRentRule);
    const result = await svc.calculate(new Decimal('200000'), 'rent', 'TH');

    expect(result.rate).toBe(5);
    expect(result.whtAmount.toFixed(4)).toBe('10000.0000');
  });

  it('returns certificateRef matching WHT-{uuid} pattern', async () => {
    mockFindWhtRule.mockResolvedValue(thServicesRule);
    const result = await svc.calculate(new Decimal('50000'), 'services', 'TH');

    expect(result.certificateRef).toMatch(
      /^WHT-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('uses rate from rule — not hardcoded', async () => {
    const customRule: WhtRuleRow = { ...thServicesRule, rate: '7.50' };
    mockFindWhtRule.mockResolvedValue(customRule);
    const result = await svc.calculate(new Decimal('100000'), 'services', 'SG');

    expect(result.rate).toBe(7.5);
    expect(result.whtAmount.toFixed(4)).toBe('7500.0000');
  });

  it('rounds to 4 decimal places', async () => {
    const thirdRule: WhtRuleRow = { ...thServicesRule, rate: '3.00' };
    mockFindWhtRule.mockResolvedValue(thirdRule);
    const result = await svc.calculate(new Decimal('33333.33'), 'services', 'TH');

    // 33333.33 * 3 / 100 = 999.9999
    expect(result.whtAmount.decimalPlaces()).toBeLessThanOrEqual(4);
  });

  it('throws NotFoundException when no rule exists for jurisdiction/type', async () => {
    mockFindWhtRule.mockResolvedValue(null);
    await expect(svc.calculate(new Decimal('100000'), 'royalties', 'MY')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException with informative message', async () => {
    mockFindWhtRule.mockResolvedValue(null);
    await expect(svc.calculate(new Decimal('100000'), 'royalties', 'MY')).rejects.toThrow(
      'No active WHT rule found for jurisdiction=MY service_type=royalties',
    );
  });

  it('queries repo with correct jurisdiction and service_type', async () => {
    mockFindWhtRule.mockResolvedValue(thServicesRule);
    await svc.calculate(new Decimal('10000'), 'services', 'TH');
    expect(mockFindWhtRule).toHaveBeenCalledWith('TH', 'services');
  });
});
