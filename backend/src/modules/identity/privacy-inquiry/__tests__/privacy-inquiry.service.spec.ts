// Pre-auth privacy-inquiry unit tests (ADR-091).
//
// The behaviours worth protecting here are the ones whose regression is invisible in a happy path:
//   - the endpoint returns ONLY a reference and a timestamp; echoing the sender's input back would
//     make an unauthenticated route into an oracle for probing what the platform stores
//   - the reference is RANDOM, not a sequence — a monotonic public handle discloses the volume of
//     inquiries the platform receives and the rate between any two of them
//   - a reference collision is retried rather than surfaced, but only so far: a third failure is a
//     real fault and must not be swallowed
//   - it does NOT go through TenantPrismaService — there is no tenant, and a future refactor that
//     "helpfully" routes it there would make the whole channel throw for every sender
//   - the client is closed on shutdown (ADR-034 / Rule 39)

const prismaMock = {
  privacyInquiry: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  $disconnect: jest.fn(),
};

jest.mock('../../../../shared/prisma/create-prisma-client', () => ({
  createPrismaClient: (...args: unknown[]) => {
    createPrismaClientCalls.push(args);
    return prismaMock;
  },
}));
jest.mock('../../../../shared/prisma/app-database-url', () => ({
  appDatabaseUrl: () => 'postgresql://app_user@pgbouncer:6432/cos',
}));
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const createPrismaClientCalls: unknown[][] = [];

import { NotFoundException } from '@nestjs/common';
import { PrivacyInquiryService } from '../privacy-inquiry.service';
import type { CreatePrivacyInquiryDto } from '../dto/create-privacy-inquiry.dto';

const RECEIVED = new Date('2026-08-17T09:00:00.000Z');

const MINIMAL: CreatePrivacyInquiryDto = {
  full_name: 'Somchai Prasert',
  email: 'somchai@example.co.th',
  subject: 'Access to my site photos',
  message: 'Please send me a copy of everything you hold about me.',
};

const FULL: CreatePrivacyInquiryDto = {
  ...MINIMAL,
  phone: '+66811234567',
  category: 'DATA_ACCESS',
};

function service(): PrivacyInquiryService {
  return new PrivacyInquiryService();
}

/** Prisma's unique-constraint failure, shaped as the client throws it. */
const uniqueViolation = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

beforeEach(() => {
  jest.clearAllMocks();
  createPrismaClientCalls.length = 0;
  prismaMock.privacyInquiry.create.mockResolvedValue({
    reference: 'REQ-A1B2-C3D4',
    receivedAt: RECEIVED,
  });
});

describe('PrivacyInquiryService.create', () => {
  it('returns only the reference and the timestamp', async () => {
    const receipt = await service().create(FULL);

    // Exhaustive on purpose: `toEqual` fails if a future change starts echoing the sender's own
    // fields back, which is the property this assertion exists for.
    expect(receipt).toEqual({ reference: 'REQ-A1B2-C3D4', received_at: RECEIVED.toISOString() });
  });

  it('stores every supplied field', async () => {
    await service().create(FULL);

    expect(prismaMock.privacyInquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          senderName: FULL.full_name,
          senderEmail: FULL.email,
          senderPhone: FULL.phone,
          category: FULL.category,
          subject: FULL.subject,
          message: FULL.message,
        }),
      }),
    );
  });

  it('omits the optional columns entirely when they are absent, so the DB defaults apply', async () => {
    await service().create(MINIMAL);

    const { data } = prismaMock.privacyInquiry.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    // NOT `senderPhone: undefined` — Prisma treats an explicit undefined as "no change", but the
    // category default (GENERAL) only applies when the key is absent from the payload.
    expect('senderPhone' in data).toBe(false);
    expect('category' in data).toBe(false);
  });

  it('generates a reference in the documented shape', async () => {
    await service().create(MINIMAL);

    const { data } = prismaMock.privacyInquiry.create.mock.calls[0]![0] as {
      data: { reference: string };
    };
    expect(data.reference).toMatch(/^REQ-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  });

  it('does not generate the same reference twice in a row', async () => {
    // Not a randomness proof — it is the regression guard for someone replacing the generator with a
    // counter or a constant, which is exactly the change this table must not accept.
    const svc = service();
    await svc.create(MINIMAL);
    await svc.create(MINIMAL);

    const [first, second] = prismaMock.privacyInquiry.create.mock.calls.map(
      (call) => (call[0] as { data: { reference: string } }).data.reference,
    );
    expect(first).not.toBe(second);
  });

  it('retries a reference collision with a fresh reference', async () => {
    prismaMock.privacyInquiry.create
      .mockRejectedValueOnce(uniqueViolation)
      .mockResolvedValueOnce({ reference: 'REQ-ZZZZ-9999', receivedAt: RECEIVED });

    const receipt = await service().create(MINIMAL);

    expect(receipt.reference).toBe('REQ-ZZZZ-9999');
    const refs = prismaMock.privacyInquiry.create.mock.calls.map(
      (call) => (call[0] as { data: { reference: string } }).data.reference,
    );
    expect(refs[0]).not.toBe(refs[1]);
  });

  it('gives up after three collisions rather than looping', async () => {
    prismaMock.privacyInquiry.create.mockRejectedValue(uniqueViolation);

    await expect(service().create(MINIMAL)).rejects.toBe(uniqueViolation);
    expect(prismaMock.privacyInquiry.create).toHaveBeenCalledTimes(3);
  });

  it('rethrows a non-collision error immediately', async () => {
    const boom = Object.assign(new Error('connection reset'), { code: 'P1001' });
    prismaMock.privacyInquiry.create.mockRejectedValue(boom);

    await expect(service().create(MINIMAL)).rejects.toBe(boom);
    // One attempt, not three: a dead connection is not retried by pretending it was a collision.
    expect(prismaMock.privacyInquiry.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a plain error', new Error('nope')],
    ['a string', 'nope'],
    ['null', null],
  ])('rethrows %s that carries no Prisma code', async (_label, thrown) => {
    prismaMock.privacyInquiry.create.mockRejectedValue(thrown);

    await expect(service().create(MINIMAL)).rejects.toBe(thrown);
    expect(prismaMock.privacyInquiry.create).toHaveBeenCalledTimes(1);
  });
});

describe('PrivacyInquiryService reads', () => {
  it('lists oldest first and does not filter when no status is given', async () => {
    prismaMock.privacyInquiry.findMany.mockResolvedValue([]);

    await service().list();

    expect(prismaMock.privacyInquiry.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { receivedAt: 'asc' },
    });
  });

  it('filters by status when one is given', async () => {
    prismaMock.privacyInquiry.findMany.mockResolvedValue([]);

    await service().list('OPEN');

    expect(prismaMock.privacyInquiry.findMany).toHaveBeenCalledWith({
      where: { status: 'OPEN' },
      orderBy: { receivedAt: 'asc' },
    });
  });

  it('returns the row for a known reference', async () => {
    const row = { reference: 'REQ-A1B2-C3D4' };
    prismaMock.privacyInquiry.findUnique.mockResolvedValue(row);

    await expect(service().findByReference('REQ-A1B2-C3D4')).resolves.toBe(row);
  });

  it('404s on an unknown reference rather than returning null', async () => {
    prismaMock.privacyInquiry.findUnique.mockResolvedValue(null);

    await expect(service().findByReference('REQ-0000-0000')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('PrivacyInquiryService wiring', () => {
  it('connects as app_user, never as the RLS-bypassing superuser', () => {
    service();

    // The whole table is unprotected by RLS (it has no tenant to isolate by), so the connection role
    // is the only thing left saying this service is not a superuser.
    expect(createPrismaClientCalls[0]).toEqual(['postgresql://app_user@pgbouncer:6432/cos']);
  });

  it('closes the client on shutdown (ADR-034 / Rule 39)', async () => {
    await service().onModuleDestroy();

    expect(prismaMock.$disconnect).toHaveBeenCalledTimes(1);
  });
});
