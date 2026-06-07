// Unit tests — ConstructionFinancingStub (Phase 7)
// Verifies: Type A fail-fast — logs WARN and throws NotImplementedException.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { NotImplementedException } from '@nestjs/common';
import {
  ConstructionFinancingStub,
  CONSTRUCTION_FINANCING,
} from '../ep/construction-financing.stub';

const stub = new ConstructionFinancingStub();

describe('ConstructionFinancingStub.submitFactoringApplication', () => {
  it('throws NotImplementedException', async () => {
    await expect(stub.submitFactoringApplication('inv-001', 'tenant-001')).rejects.toThrow(
      NotImplementedException,
    );
  });

  it('throws with activation message', async () => {
    await expect(stub.submitFactoringApplication('inv-001', 'tenant-001')).rejects.toThrow(
      'ConstructionFinancing not yet activated',
    );
  });

  it('throws for any invoice/tenant combination', async () => {
    await expect(stub.submitFactoringApplication('inv-999', 'other-tenant')).rejects.toThrow(
      NotImplementedException,
    );
  });
});

describe('CONSTRUCTION_FINANCING symbol', () => {
  it('is a Symbol', () => {
    expect(typeof CONSTRUCTION_FINANCING).toBe('symbol');
  });
});
