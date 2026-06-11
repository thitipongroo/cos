// ComplianceAuditService — Phase 16 stub (Type A — fail-fast per spec §32.9)
// Would normally start ComplianceAuditWorkflow via the Temporal client.
// Stub: log WARN + throw typed exception.

import { Injectable } from '@nestjs/common';
import { createLogger } from '@cos/logger';
import { ComplianceAuditNotAvailableException } from './compliance-audit.exception';
import type { ComplianceAuditInput } from './workflows/compliance-audit.workflow';

const logger = createLogger('compliance-audit-service');

@Injectable()
export class ComplianceAuditService {
  triggerAudit(input: ComplianceAuditInput): never {
    logger.warn(
      { tenantId: input.tenantId, certificationTarget: input.certificationTarget },
      'ComplianceAuditService.triggerAudit stub reached — integration not active (spec §32.9 Type A)',
    );
    throw new ComplianceAuditNotAvailableException(input.certificationTarget);
  }
}
