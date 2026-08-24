// ComplianceAuditWorkflow — Phase 16 stub
// Trigger: 6 months before certification date (SOC 2 / ISO 27001 / PDPA — spec §5.3.1)
// Stub type: Type A — fail-fast (spec §32.9)
//
// Replace this stub with the real workflow when the trigger condition is met.
// Real implementation: collect evidence from docs/policies/ and docs/registers/, assign
// TENANT_ADMIN as evidence owner, gate on all items COMPLETE before auditor engagement.

import { log } from '@temporalio/workflow';

export interface ComplianceAuditInput {
  tenantId: string;
  certificationTarget: 'SOC2_TYPE_II' | 'ISO_27001' | 'PDPA';
  certificationDate: string;
}

export async function complianceAuditWorkflow(input: ComplianceAuditInput): Promise<void> {
  log.warn(
    `ComplianceAuditWorkflow stub reached — integration not active. ` +
      `tenantId=${input.tenantId} target=${input.certificationTarget}. ` +
      `Implement when trigger condition met (6 months before certification date). ` +
      `Source: spec §5.3.1 + §32.9 Integration Stub Pattern.`,
  );

  throw new Error(
    'ComplianceAuditWorkflow: not implemented — Type A stub (spec §32.9). ' +
      'Trigger condition: 6 months before certification date.',
  );
}
