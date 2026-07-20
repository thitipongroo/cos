import {
  COS_CREDENTIALS_CONTEXT,
  COS_CREDENTIALS_CONTEXT_URL,
  CREDENTIAL_TYPES,
} from '../credential-context.js';

describe('credential-context (CS-7)', () => {
  it('defines a protected context URL with the four credential types + claim terms', () => {
    expect(COS_CREDENTIALS_CONTEXT_URL).toMatch(/^https:\/\//);
    const ctx = COS_CREDENTIALS_CONTEXT['@context'] as Record<string, unknown>;
    expect(ctx['@protected']).toBe(true);
    for (const t of ['ContractSignatureVC', 'LicenceVC', 'EquipmentCertVC', 'TrainingRecordVC']) {
      expect(ctx[t]).toBeDefined();
    }
    for (const term of ['documentHash', 'licenceNumber', 'equipmentId', 'courseName']) {
      expect(ctx[term]).toBeDefined();
    }
  });

  it('exposes credential type name constants', () => {
    expect(CREDENTIAL_TYPES.CONTRACT_SIGNATURE).toBe('ContractSignatureVC');
    expect(CREDENTIAL_TYPES.LICENCE).toBe('LicenceVC');
    expect(CREDENTIAL_TYPES.EQUIPMENT_CERT).toBe('EquipmentCertVC');
    expect(CREDENTIAL_TYPES.TRAINING_RECORD).toBe('TrainingRecordVC');
  });
});
