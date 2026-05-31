// EP-DOMAIN-001: CRMIntegration
// Source: context/00_master_construction_os.md §Phase 3 Extension Points
// Trigger: sales team uses external CRM (Salesforce, HubSpot) and wants won deals to
//          auto-create projects without manual re-entry
// Data flow: CRM (won deal) → webhook → COS project creation (one direction only)

import { StubBase } from '../stub-base';

export interface CrmProject {
  project_id: string; // UUID of created COS project
  project_code: string;
  project_name: string;
}

export class CRMIntegration extends StubBase {
  readonly EP_ID = 'EP-DOMAIN-001';
  readonly EP_VERSION = '0.1.0';
  readonly TRIGGER = 'Sales team CRM integration — won deals should auto-create projects';
  readonly PHASE = 'Phase 3 (stub)';

  // Strategy pattern: crmSource identifies which CRM field mapper to apply.
  // Candidates: Salesforce REST API, HubSpot Webhook, Pipedrive Webhook
  async createProjectFromLead(
    crmLeadId: string,
    tenantId: string,
    crmSource: string,
  ): Promise<CrmProject> {
    this.logStubCall('createProjectFromLead', { crmLeadId, tenantId, crmSource });
    return { project_id: '', project_code: '', project_name: '' };
  }
}
