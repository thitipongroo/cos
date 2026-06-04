// ERPIntegration EP Stubs — Phase 7
// DECIDED (spec §13.3 / Phase 7): Strategy pattern — one interface, per-ERP adapter.
// Each stub is implemented when the first tenant using that ERP onboards.
// Credentials stored per-tenant in AWS SM / Vault.

import { NotImplementedException } from '@nestjs/common';
import { createLogger } from '@cos/logger';

const logger = createLogger('erp-integration');

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ERPIntegration {
  postCostTransaction(tenantId: string, transactionId: string): Promise<void>;
  postInvoice(tenantId: string, invoiceId: string): Promise<void>;
  syncVendor(tenantId: string, vendorId: string): Promise<void>;
}

// ─── Stubs ────────────────────────────────────────────────────────────────────

export class SAPAdapterStub implements ERPIntegration {
  async postCostTransaction(tenantId: string, transactionId: string): Promise<void> {
    logger.warn(
      { tenantId, transactionId, adapter: 'SAPAdapter' },
      'ERP not activated — implement when first SAP tenant onboards',
    );
    throw new NotImplementedException('SAPAdapter not yet activated');
  }
  async postInvoice(tenantId: string, invoiceId: string): Promise<void> {
    logger.warn({ tenantId, invoiceId, adapter: 'SAPAdapter' }, 'ERP not activated');
    throw new NotImplementedException('SAPAdapter not yet activated');
  }
  async syncVendor(tenantId: string, vendorId: string): Promise<void> {
    logger.warn({ tenantId, vendorId, adapter: 'SAPAdapter' }, 'ERP not activated');
    throw new NotImplementedException('SAPAdapter not yet activated');
  }
}

export class OracleAdapterStub implements ERPIntegration {
  async postCostTransaction(tenantId: string, transactionId: string): Promise<void> {
    logger.warn(
      { tenantId, transactionId, adapter: 'OracleAdapter' },
      'ERP not activated — implement when first Oracle tenant onboards',
    );
    throw new NotImplementedException('OracleAdapter not yet activated');
  }
  async postInvoice(tenantId: string, invoiceId: string): Promise<void> {
    logger.warn({ tenantId, invoiceId, adapter: 'OracleAdapter' }, 'ERP not activated');
    throw new NotImplementedException('OracleAdapter not yet activated');
  }
  async syncVendor(tenantId: string, vendorId: string): Promise<void> {
    logger.warn({ tenantId, vendorId, adapter: 'OracleAdapter' }, 'ERP not activated');
    throw new NotImplementedException('OracleAdapter not yet activated');
  }
}

export class DynamicsAdapterStub implements ERPIntegration {
  async postCostTransaction(tenantId: string, transactionId: string): Promise<void> {
    logger.warn(
      { tenantId, transactionId, adapter: 'DynamicsAdapter' },
      'ERP not activated — implement when first Dynamics tenant onboards',
    );
    throw new NotImplementedException('DynamicsAdapter not yet activated');
  }
  async postInvoice(tenantId: string, invoiceId: string): Promise<void> {
    logger.warn({ tenantId, invoiceId, adapter: 'DynamicsAdapter' }, 'ERP not activated');
    throw new NotImplementedException('DynamicsAdapter not yet activated');
  }
  async syncVendor(tenantId: string, vendorId: string): Promise<void> {
    logger.warn({ tenantId, vendorId, adapter: 'DynamicsAdapter' }, 'ERP not activated');
    throw new NotImplementedException('DynamicsAdapter not yet activated');
  }
}

export const ERP_INTEGRATION = Symbol('ERP_INTEGRATION');
