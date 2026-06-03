// CRMIntegration EP Stubs — Phase 3
// Source: docs/specifications/13-product-architecture.md §CRM Integration
// Three adapter stubs — each implemented when the first tenant using that CRM onboards.
// API credentials, field mappings, and authentication configured per-tenant in AWS SM / Vault.
//
// Data flow (one direction only):
//   CRM "won deal" event → webhook → COS project creation

import { NotImplementedException } from '@nestjs/common';
import { createLogger } from '@cos/logger';
import type { ProjectRow } from '../project.repository';

const logger = createLogger('crm-integration');

// ─── Interface ────────────────────────────────────────────────────────────────

export interface CrmIntegration {
  createProjectFromLead(crmLeadId: string, tenantId: string): Promise<ProjectRow>;
}

// ─── Stubs ────────────────────────────────────────────────────────────────────

export class SalesforceAdapterStub implements CrmIntegration {
  async createProjectFromLead(crmLeadId: string, tenantId: string): Promise<ProjectRow> {
    logger.warn(
      { crmLeadId, tenantId, adapter: 'SalesforceAdapter' },
      'CRM integration not activated — implement when first Salesforce tenant onboards',
    );
    throw new NotImplementedException('SalesforceAdapter not yet activated');
  }
}

export class HubSpotAdapterStub implements CrmIntegration {
  async createProjectFromLead(crmLeadId: string, tenantId: string): Promise<ProjectRow> {
    logger.warn(
      { crmLeadId, tenantId, adapter: 'HubSpotAdapter' },
      'CRM integration not activated — implement when first HubSpot tenant onboards',
    );
    throw new NotImplementedException('HubSpotAdapter not yet activated');
  }
}

export class PipedriveAdapterStub implements CrmIntegration {
  async createProjectFromLead(crmLeadId: string, tenantId: string): Promise<ProjectRow> {
    logger.warn(
      { crmLeadId, tenantId, adapter: 'PipedriveAdapter' },
      'CRM integration not activated — implement when first Pipedrive tenant onboards',
    );
    throw new NotImplementedException('PipedriveAdapter not yet activated');
  }
}

export const CRM_INTEGRATION = Symbol('CRM_INTEGRATION');
