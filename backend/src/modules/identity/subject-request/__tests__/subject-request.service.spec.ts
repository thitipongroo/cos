// Unit tests — SubjectRequestService (ADR-090).
//
// What these pin down is the part that would be a compliance bug if it drifted: the search reads its
// identifiers from the REQUEST ROW rather than from the caller, a closed request cannot be searched
// again, erasure refuses to run from an ACCESS request, and every privileged action writes an audit
// row carrying the count.

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubjectRequestService } from '../subject-request.service';
import type { SubjectRequestRepository, SubjectRequestRow } from '../subject-request.repository';

const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR = '22222222-2222-4222-8222-222222222222';

const openRequest = (over: Partial<SubjectRequestRow> = {}): SubjectRequestRow =>
  ({
    request_id: REQUEST_ID,
    tenant_id: 'tenant-1',
    request_type: 'ACCESS',
    subject_email: 'somchai@example.co.th',
    subject_phone: null,
    status: 'OPEN',
    received_at: new Date('2026-08-14T09:00:00.000Z'),
    opened_by: ACTOR,
    opened_at: new Date('2026-08-15T00:00:00.000Z'),
    closed_at: null,
    outcome_note: null,
    ...over,
  }) as SubjectRequestRow;

describe('SubjectRequestService', () => {
  let repo: jest.Mocked<
    Pick<
      SubjectRequestRepository,
      'create' | 'list' | 'findById' | 'close' | 'findMatches' | 'anonymise' | 'writeAudit'
    >
  >;
  let service: SubjectRequestService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
      close: jest.fn(),
      findMatches: jest.fn(),
      anonymise: jest.fn(),
      writeAudit: jest.fn(),
    } as unknown as typeof repo;
    service = new SubjectRequestService(repo as unknown as SubjectRequestRepository);
  });

  describe('create', () => {
    it('trims the identifiers and stores the supplied received_at', async () => {
      repo.create.mockResolvedValue(openRequest());
      await service.create(
        {
          request_type: 'ACCESS',
          subject_email: '  somchai@example.co.th  ',
          received_at: '2026-08-14T09:00:00.000Z',
          note: '  by email  ',
        },
        ACTOR,
      );
      expect(repo.create).toHaveBeenCalledWith({
        request_type: 'ACCESS',
        subject_email: 'somchai@example.co.th',
        subject_phone: null,
        received_at: new Date('2026-08-14T09:00:00.000Z'),
        opened_by: ACTOR,
        note: 'by email',
      });
    });

    it('rejects whitespace-only identifiers, which the DTO and the DB CHECK both accept', async () => {
      // Both of those describe the SHAPE of the payload; '   ' satisfies them and would authorise a
      // search matching nothing, which afterwards reads as "the tenant holds nothing about them".
      await expect(
        service.create(
          {
            request_type: 'ACCESS',
            subject_email: '   ',
            subject_phone: '  ',
            received_at: '2026-08-14T09:00:00.000Z',
          },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rejects a future received_at — it would push the §30 deadline out invisibly', async () => {
      const future = new Date(Date.now() + 86_400_000).toISOString();
      await expect(
        service.create(
          { request_type: 'ERASURE', subject_phone: '0812345678', received_at: future },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a phone-only request and a missing note', async () => {
      repo.create.mockResolvedValue(openRequest());
      await service.create(
        {
          request_type: 'ERASURE',
          subject_phone: '0812345678',
          received_at: '2026-08-14T09:00:00.000Z',
        },
        ACTOR,
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ subject_email: null, subject_phone: '0812345678', note: null }),
      );
    });
  });

  it('list() passes the filter straight through', async () => {
    repo.list.mockResolvedValue([]);
    await expect(service.list('OPEN')).resolves.toEqual([]);
    expect(repo.list).toHaveBeenCalledWith('OPEN');
  });

  describe('findMatches', () => {
    it('searches on the identifiers from the REQUEST ROW and audits the count', async () => {
      repo.findById.mockResolvedValue(openRequest());
      repo.findMatches.mockResolvedValue([
        { source: 'crm.contacts', id: 'c1', fields: { name: 'Somchai' } },
      ]);

      const result = await service.findMatches(REQUEST_ID, ACTOR);

      expect(repo.findMatches).toHaveBeenCalledWith('somchai@example.co.th', null);
      expect(result.matches).toHaveLength(1);
      expect(result.note).toBeNull();
      expect(repo.writeAudit).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR, requestId: REQUEST_ID, matches: 1 }),
      );
    });

    it('says why an empty result is not the same as "nothing is held"', async () => {
      repo.findById.mockResolvedValue(openRequest());
      repo.findMatches.mockResolvedValue([]);
      const result = await service.findMatches(REQUEST_ID, ACTOR);
      expect(result.note).toContain('lead with no contact row');
    });

    it('404s on an unknown request', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findMatches(REQUEST_ID, ACTOR)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses to search a closed request — the authorisation is spent', async () => {
      repo.findById.mockResolvedValue(openRequest({ status: 'FULFILLED' }));
      await expect(service.findMatches(REQUEST_ID, ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.findMatches).not.toHaveBeenCalled();
    });
  });

  describe('erase', () => {
    it('anonymises, totals the rows and audits', async () => {
      repo.findById.mockResolvedValue(openRequest({ request_type: 'ERASURE' }));
      repo.anonymise.mockResolvedValue({ contacts: 2, leads: 1, vendors: 1 });

      await expect(service.erase(REQUEST_ID, ACTOR)).resolves.toEqual({
        request_id: REQUEST_ID,
        anonymised: { contacts: 2, leads: 1, vendors: 1 },
        total: 4,
      });
      expect(repo.writeAudit).toHaveBeenCalledWith(expect.objectContaining({ matches: 4 }));
    });

    it('refuses to erase from an ACCESS request — that would destroy what was asked to be seen', async () => {
      repo.findById.mockResolvedValue(openRequest({ request_type: 'ACCESS' }));
      await expect(service.erase(REQUEST_ID, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.anonymise).not.toHaveBeenCalled();
    });

    it('404s on an unknown request', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.erase(REQUEST_ID, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('close', () => {
    it('stores the outcome note verbatim', async () => {
      const closed = openRequest({
        status: 'REJECTED',
        outcome_note: 'Retained — Revenue Code §87.',
      });
      repo.close.mockResolvedValue(closed);
      await expect(
        service.close(
          REQUEST_ID,
          { status: 'REJECTED', outcome_note: 'Retained — Revenue Code §87.' },
          ACTOR,
        ),
      ).resolves.toBe(closed);
    });

    it('404s when the request is missing OR already closed — the two are not distinguished', async () => {
      // Telling an admin of tenant A that an id exists in tenant B is the disclosure this avoids.
      repo.close.mockResolvedValue(null);
      await expect(
        service.close(
          REQUEST_ID,
          { status: 'FULFILLED', outcome_note: 'anonymised 2 rows' },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
