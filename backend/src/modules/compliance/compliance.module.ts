import { Module } from '@nestjs/common';
import { ComplianceAuditService } from './compliance-audit.service';

@Module({
  providers: [ComplianceAuditService],
  exports: [ComplianceAuditService],
})
export class ComplianceModule {}
