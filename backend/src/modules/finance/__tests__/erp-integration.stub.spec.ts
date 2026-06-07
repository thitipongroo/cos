// Unit tests — ERPIntegration stubs (Phase 7)
// Verifies: all 3 adapters are Type A fail-fast (log WARN + NotImplementedException).

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { NotImplementedException } from '@nestjs/common';
import {
  SAPAdapterStub,
  OracleAdapterStub,
  DynamicsAdapterStub,
  ERP_INTEGRATION,
} from '../ep/erp-integration.stub';

const TENANT = 'tenant-001';
const TRANSACTION = 'tx-001';
const INVOICE = 'inv-001';
const VENDOR = 'vendor-001';

// ── SAPAdapterStub ──────────────────────────────────────────────────────────

describe('SAPAdapterStub', () => {
  const stub = new SAPAdapterStub();

  it('postCostTransaction throws NotImplementedException', async () => {
    await expect(stub.postCostTransaction(TENANT, TRANSACTION)).rejects.toThrow(
      NotImplementedException,
    );
  });

  it('postInvoice throws NotImplementedException', async () => {
    await expect(stub.postInvoice(TENANT, INVOICE)).rejects.toThrow(NotImplementedException);
  });

  it('syncVendor throws NotImplementedException', async () => {
    await expect(stub.syncVendor(TENANT, VENDOR)).rejects.toThrow(NotImplementedException);
  });

  it('postCostTransaction throws with SAP message', async () => {
    await expect(stub.postCostTransaction(TENANT, TRANSACTION)).rejects.toThrow(
      'SAPAdapter not yet activated',
    );
  });
});

// ── OracleAdapterStub ───────────────────────────────────────────────────────

describe('OracleAdapterStub', () => {
  const stub = new OracleAdapterStub();

  it('postCostTransaction throws NotImplementedException', async () => {
    await expect(stub.postCostTransaction(TENANT, TRANSACTION)).rejects.toThrow(
      NotImplementedException,
    );
  });

  it('postInvoice throws NotImplementedException', async () => {
    await expect(stub.postInvoice(TENANT, INVOICE)).rejects.toThrow(NotImplementedException);
  });

  it('syncVendor throws NotImplementedException', async () => {
    await expect(stub.syncVendor(TENANT, VENDOR)).rejects.toThrow(NotImplementedException);
  });

  it('postCostTransaction throws with Oracle message', async () => {
    await expect(stub.postCostTransaction(TENANT, TRANSACTION)).rejects.toThrow(
      'OracleAdapter not yet activated',
    );
  });
});

// ── DynamicsAdapterStub ─────────────────────────────────────────────────────

describe('DynamicsAdapterStub', () => {
  const stub = new DynamicsAdapterStub();

  it('postCostTransaction throws NotImplementedException', async () => {
    await expect(stub.postCostTransaction(TENANT, TRANSACTION)).rejects.toThrow(
      NotImplementedException,
    );
  });

  it('postInvoice throws NotImplementedException', async () => {
    await expect(stub.postInvoice(TENANT, INVOICE)).rejects.toThrow(NotImplementedException);
  });

  it('syncVendor throws NotImplementedException', async () => {
    await expect(stub.syncVendor(TENANT, VENDOR)).rejects.toThrow(NotImplementedException);
  });

  it('postCostTransaction throws with Dynamics message', async () => {
    await expect(stub.postCostTransaction(TENANT, TRANSACTION)).rejects.toThrow(
      'DynamicsAdapter not yet activated',
    );
  });
});

// ── Symbol export ───────────────────────────────────────────────────────────

describe('ERP_INTEGRATION symbol', () => {
  it('is a Symbol', () => {
    expect(typeof ERP_INTEGRATION).toBe('symbol');
  });
});
