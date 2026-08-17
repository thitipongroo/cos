// Privacy-inquiry controller tests (ADR-091).
//
// These assert the SHAPE OF THE GUARDS as much as the delegation, because the whole design rests on
// one class being reachable without a token and the other not. A future edit that moves the POST onto
// the admin class, or drops @Roles from a read, is a security regression that no happy-path test
// would notice — so the metadata is read back off the classes here.

import { Reflector } from '@nestjs/core';
import { CosRole } from '@cos/types';
import { ROLES_KEY } from '@cos/rbac';
import { FEATURE_FLAG_KEY } from '../../../../shared/feature-flags/feature-flag.decorator';
import {
  PrivacyInquiryAdminController,
  PrivacyInquiryPublicController,
  PRIVACY_INQUIRY_FLAG,
} from '../privacy-inquiry.controller';
import type { CreatePrivacyInquiryDto } from '../dto/create-privacy-inquiry.dto';

const DTO: CreatePrivacyInquiryDto = {
  full_name: 'Somchai Prasert',
  email: 'somchai@example.co.th',
  subject: 'Access to my site photos',
  message: 'Please send me a copy of everything you hold about me.',
};

const service = {
  create: jest.fn(),
  list: jest.fn(),
  findByReference: jest.fn(),
};

const reflector = new Reflector();

beforeEach(() => jest.clearAllMocks());

describe('PrivacyInquiryPublicController', () => {
  const controller = new PrivacyInquiryPublicController(service as never);

  it('passes the DTO straight through', async () => {
    service.create.mockResolvedValue({ reference: 'REQ-A1B2-C3D4', received_at: 'x' });

    await expect(controller.create(DTO)).resolves.toEqual({
      reference: 'REQ-A1B2-C3D4',
      received_at: 'x',
    });
    expect(service.create).toHaveBeenCalledWith(DTO);
  });

  it('carries the QM-15 kill switch on the public write', () => {
    // Publicly writable, so the switch is also the abuse control: OFF stops a spam wave in under 60
    // seconds without a deploy.
    const flag = reflector.get<string>(FEATURE_FLAG_KEY, controller.create);
    expect(flag).toBe(PRIVACY_INQUIRY_FLAG);
  });

  it('declares no role requirement — this route is reachable without an account', () => {
    // The assertion is deliberately the ABSENCE of @Roles. A person with no account is exactly who
    // this endpoint is for (ADR-091); adding a role here would close the channel silently.
    expect(reflector.get(ROLES_KEY, controller.create)).toBeUndefined();
    expect(reflector.get(ROLES_KEY, PrivacyInquiryPublicController)).toBeUndefined();
  });

  it('rate-limits at the auth tier, not the general tier', () => {
    // QM-7: 10/min per IP. An unauthenticated route that writes a row belongs with OTP request, not
    // with ordinary reads at 100/min.
    //
    // @Throttle stores one metadata entry per limiter NAME — key + name, not a nested object — so the
    // suffix is `default`, matching the limiter registered in app.module.
    //
    // The keys are spelled out rather than imported: @nestjs/throttler declares THROTTLER_LIMIT /
    // THROTTLER_TTL in `dist/throttler.constants` but does NOT re-export them from the package root,
    // so importing them means reaching into the package's internals. These two strings are stable
    // across the v6 line and a rename would fail here loudly, which is what this assertion is for.
    expect(reflector.get<number>('THROTTLER:LIMITdefault', controller.create)).toBe(10);
    expect(reflector.get<number>('THROTTLER:TTLdefault', controller.create)).toBe(60_000);
  });
});

describe('PrivacyInquiryAdminController', () => {
  const controller = new PrivacyInquiryAdminController(service as never);

  it('lists without a status filter', async () => {
    service.list.mockResolvedValue([]);

    await expect(controller.list()).resolves.toEqual([]);
    expect(service.list).toHaveBeenCalledWith(undefined);
  });

  it('passes a status filter through', async () => {
    service.list.mockResolvedValue([]);

    await controller.list('OPEN');

    expect(service.list).toHaveBeenCalledWith('OPEN');
  });

  it('fetches one inquiry by reference', async () => {
    const row = { reference: 'REQ-A1B2-C3D4' };
    service.findByReference.mockResolvedValue(row);

    await expect(controller.findOne('REQ-A1B2-C3D4')).resolves.toBe(row);
    expect(service.findByReference).toHaveBeenCalledWith('REQ-A1B2-C3D4');
  });

  it.each([
    ['list', (c: PrivacyInquiryAdminController) => c.list],
    ['findOne', (c: PrivacyInquiryAdminController) => c.findOne],
  ])('restricts %s to SYSTEM_ADMIN', (_name, pick) => {
    // SYSTEM_ADMIN, not TENANT_ADMIN: the queue is cross-tenant by construction — the sender has not
    // been matched to a tenant — so a tenant admin reading it would be reading strangers' inquiries
    // about other organisations.
    const roles = reflector.get<CosRole[]>(ROLES_KEY, pick(controller));
    expect(roles).toEqual([CosRole.SYSTEM_ADMIN]);
  });
});
