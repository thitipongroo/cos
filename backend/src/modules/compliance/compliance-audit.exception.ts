import { NotImplementedException } from '@nestjs/common';

export class ComplianceAuditNotAvailableException extends NotImplementedException {
  constructor(certificationTarget: string) {
    super(
      `ComplianceAuditWorkflow not available for target ${certificationTarget}. ` +
        'Trigger condition: 6 months before certification date (spec §5.3.1).',
    );
  }
}
