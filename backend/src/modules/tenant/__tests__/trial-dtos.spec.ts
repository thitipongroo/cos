// Validation of the two free-trial request bodies (§7.10, ADR-109).

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTrialTenantDto } from '../dto/create-trial-tenant.dto';
import { ConvertTenantDto } from '../dto/convert-tenant.dto';

const JUSTIFICATION = 'Trial requested on construction-os.io (request 7c0e4d3a).';

async function failing(cls: new () => object, body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body));
  return errors.map((e) => e.property);
}

describe('CreateTrialTenantDto', () => {
  const valid = {
    tenantCode: 'somchai_build',
    tenantName: 'Somchai Build',
    planType: 'STARTER',
    justification: JUSTIFICATION,
  };

  it('accepts a minimal body, and every optional field', async () => {
    expect(await failing(CreateTrialTenantDto, valid)).toEqual([]);
    expect(
      await failing(CreateTrialTenantDto, {
        ...valid,
        dataRegion: 'ap-southeast-7',
        timezone: 'Asia/Bangkok',
        trialSource: 'boq-checker',
        trialRequestRef: '7c0e4d3a-2a51-4c38-9d1e-5f0a6f2b9e11',
      }),
    ).toEqual([]);
  });

  it.each(['LITE', 'STARTER', 'PROFESSIONAL'])('accepts the trial plan %s', async (planType) => {
    expect(await failing(CreateTrialTenantDto, { ...valid, planType })).toEqual([]);
  });

  it('refuses ENTERPRISE — it is contracted, never trialled', async () => {
    expect(await failing(CreateTrialTenantDto, { ...valid, planType: 'ENTERPRISE' })).toEqual([
      'planType',
    ]);
  });

  it('does not carry the ENTERPRISE-only dedicatedDbUrl', () => {
    const dto = plainToInstance(CreateTrialTenantDto, valid);
    expect('dedicatedDbUrl' in dto).toBe(false);
  });

  it.each([
    ['trialSource', 'Pricing Page'],
    ['trialSource', 'x'.repeat(41)],
    ['trialRequestRef', "1'; DROP TABLE x"],
    ['trialRequestRef', 'a'.repeat(81)],
    ['tenantCode', 'Bad Code'],
    ['justification', 'short'],
  ])('refuses %s = %j', async (field, value) => {
    expect(await failing(CreateTrialTenantDto, { ...valid, [field]: value })).toEqual([field]);
  });
});

describe('ConvertTenantDto', () => {
  it.each(['LITE', 'STARTER', 'PROFESSIONAL'])('accepts %s', async (planType) => {
    expect(await failing(ConvertTenantDto, { planType, justification: JUSTIFICATION })).toEqual([]);
  });

  it.each(['ENTERPRISE', 'FREE', undefined])('refuses planType %j', async (planType) => {
    expect(await failing(ConvertTenantDto, { planType, justification: JUSTIFICATION })).toEqual([
      'planType',
    ]);
  });

  it('requires the justification (§6.7)', async () => {
    expect(await failing(ConvertTenantDto, { planType: 'STARTER' })).toEqual(['justification']);
  });
});
