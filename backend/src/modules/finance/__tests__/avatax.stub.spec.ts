// Unit tests — AvaTaxStub (Phase 7)
// Verifies: Type A fail-fast behavior — logs WARN and throws NotImplementedException.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { NotImplementedException } from '@nestjs/common';
import { AvaTaxStub } from '../ep/avatax.stub';
import type { TaxAddress, TaxLineItem } from '../ep/avatax.stub';

const stub = new AvaTaxStub();

const address: TaxAddress = {
  street: '123 Main St',
  city: 'Bangkok',
  region: 'BKK',
  country: 'TH',
  postalCode: '10110',
};

const lineItems: TaxLineItem[] = [
  { amount: '100000.00', quantity: 1, description: 'Construction services' },
];

describe('AvaTaxStub.calculate', () => {
  it('throws NotImplementedException', async () => {
    await expect(
      stub.calculate('100000.00', 'THB', address, address, lineItems, 'tenant-001'),
    ).rejects.toThrow(NotImplementedException);
  });

  it('throws with message about activation', async () => {
    await expect(
      stub.calculate('100000.00', 'THB', address, address, lineItems, 'tenant-001'),
    ).rejects.toThrow('AvaTax not yet activated');
  });

  it('throws for any input values', async () => {
    await expect(
      stub.calculate('0.00', 'USD', address, address, [], 'other-tenant'),
    ).rejects.toThrow(NotImplementedException);
  });
});
