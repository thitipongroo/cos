import { ComplianceAuditService } from '../compliance-audit.service';
import { ComplianceAuditNotAvailableException } from '../compliance-audit.exception';
import type { ComplianceAuditInput } from '../workflows/compliance-audit.workflow';

describe('ComplianceAuditService (§32.9 Type A stub — fail-fast)', () => {
  const service = new ComplianceAuditService();
  const input: ComplianceAuditInput = {
    tenantId: 't-1',
    certificationTarget: 'SOC2_TYPE_II',
    certificationDate: '2026-12-31',
  };

  it('triggerAudit logs a warning and throws (integration not yet active)', () => {
    expect(() => service.triggerAudit(input)).toThrow(ComplianceAuditNotAvailableException);
  });

  it('the exception names the certification target and cites spec §5.3.1', () => {
    const ex = new ComplianceAuditNotAvailableException('ISO_27001');
    expect(ex.message).toContain('ISO_27001');
    expect(ex.message).toContain('§5.3.1');
  });
});
