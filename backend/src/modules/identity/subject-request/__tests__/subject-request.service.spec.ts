// Unit tests — SubjectRequestService (ADR-090).
//
// What these pin down is the part that would be a compliance bug if it drifted: the search reads its
// identifiers from the REQUEST ROW rather than from the caller, a closed request cannot be searched
// again, erasure refuses to run from an ACCESS request, and every privileged action writes an audit
// row carrying the count.

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubjectRequestService } from '../subject-request.service';
import type { SubjectRequestRepository, SubjectRequestRow } from '../subject-request.repository';
import type { FileServiceClient } from '../../../files/file-service-client.service';
import type { FileLegalHoldService } from '../../../files/file-legal-hold.service';
import type { SubjectVerificationService } from '../subject-verification.service';
import type { SendGridAdapter } from '../../../notification/adapters/sendgrid.adapter';

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
    verification_token_hash: null,
    verification_sent_to: null,
    verification_sent_at: null,
    verified_at: null,
    verification_method: null,
    ...over,
  }) as SubjectRequestRow;

describe('SubjectRequestService', () => {
  let repo: jest.Mocked<
    Pick<
      SubjectRequestRepository,
      | 'create'
      | 'list'
      | 'findById'
      | 'close'
      | 'findMatches'
      | 'anonymise'
      | 'writeAudit'
      | 'recordChallenge'
      | 'markVerifiedByTokenHash'
    >
  >;
  let files: jest.Mocked<Pick<FileServiceClient, 'upload'>>;
  let legalHold: jest.Mocked<Pick<FileLegalHoldService, 'place'>>;
  let verification: jest.Mocked<Pick<SubjectVerificationService, 'issue' | 'hashToken'>>;
  let email: jest.Mocked<Pick<SendGridAdapter, 'send'>>;
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
      recordChallenge: jest.fn(),
      markVerifiedByTokenHash: jest.fn(),
    } as unknown as typeof repo;
    files = { upload: jest.fn() } as unknown as typeof files;
    legalHold = { place: jest.fn() } as unknown as typeof legalHold;
    verification = {
      issue: jest.fn(),
      hashToken: jest.fn(),
    } as unknown as typeof verification;
    email = { send: jest.fn() } as unknown as typeof email;
    process.env['PUBLIC_WEB_URL'] = 'https://app.example.test';
    service = new SubjectRequestService(
      repo as unknown as SubjectRequestRepository,
      files as unknown as FileServiceClient,
      legalHold as unknown as FileLegalHoldService,
      verification as unknown as SubjectVerificationService,
      email as unknown as SendGridAdapter,
    );
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
      repo.findById.mockResolvedValue(
        openRequest({ request_type: 'ERASURE', verified_at: new Date('2026-08-15T00:00:00.000Z') }),
      );
      repo.anonymise.mockResolvedValue({ contacts: 2, leads: 1, vendors: 1, workers: 0 });

      await expect(service.erase(REQUEST_ID, {}, ACTOR)).resolves.toEqual({
        request_id: REQUEST_ID,
        anonymised: { contacts: 2, leads: 1, vendors: 1, workers: 0 },
        total: 4,
        archived_file_id: null,
      });
      expect(repo.writeAudit).toHaveBeenCalledWith(expect.objectContaining({ matches: 4 }));
    });

    it('refuses to erase from an ACCESS request — that would destroy what was asked to be seen', async () => {
      repo.findById.mockResolvedValue(openRequest({ request_type: 'ACCESS' }));
      await expect(service.erase(REQUEST_ID, {}, ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.anonymise).not.toHaveBeenCalled();
    });

    it('404s on an unknown request', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.erase(REQUEST_ID, {}, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does NOT archive by default — an always-on archive would mean nothing is ever erased', async () => {
      repo.findById.mockResolvedValue(
        openRequest({ request_type: 'ERASURE', verified_at: new Date('2026-08-15T00:00:00.000Z') }),
      );
      repo.anonymise.mockResolvedValue({ contacts: 1, leads: 0, vendors: 0, workers: 0 });

      const result = await service.erase(REQUEST_ID, {}, ACTOR);

      expect(result.archived_file_id).toBeNull();
      expect(files.upload).not.toHaveBeenCalled();
      expect(legalHold.place).not.toHaveBeenCalled();
    });

    it('snapshots BEFORE anonymising and puts the archive beyond deletion', async () => {
      repo.findById.mockResolvedValue(
        openRequest({ request_type: 'ERASURE', verified_at: new Date('2026-08-15T00:00:00.000Z') }),
      );
      repo.findMatches.mockResolvedValue([
        { source: 'crm.contacts', id: 'c1', fields: { name: 'Somchai' } },
      ]);
      files.upload.mockResolvedValue({ file_id: 'file-1' });
      legalHold.place.mockResolvedValue(true);
      repo.anonymise.mockResolvedValue({ contacts: 1, leads: 0, vendors: 0, workers: 0 });

      const result = await service.erase(
        REQUEST_ID,
        { legal_hold: true, legal_hold_reason: 'Labour Court case 123/2569' },
        ACTOR,
      );

      expect(result.archived_file_id).toBe('file-1');
      // Anonymisation is irreversible, so the snapshot has exactly one moment to be taken.
      expect(files.upload.mock.invocationCallOrder[0]).toBeLessThan(
        repo.anonymise.mock.invocationCallOrder[0]!,
      );
      expect(legalHold.place).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'file-1',
          reason: 'Labour Court case 123/2569',
          placedBy: ACTOR,
        }),
      );
      const uploaded = files.upload.mock.calls[0]![0];
      expect(JSON.parse(uploaded.buffer.toString('utf-8')).matches).toHaveLength(1);
    });

    it('aborts without touching a row when the hold cannot be placed', async () => {
      // An archive the retention sweep can delete is not an archive: proceeding would destroy the
      // operational copy and leave the evidence copy deletable.
      repo.findById.mockResolvedValue(
        openRequest({ request_type: 'ERASURE', verified_at: new Date('2026-08-15T00:00:00.000Z') }),
      );
      repo.findMatches.mockResolvedValue([]);
      files.upload.mockResolvedValue({ file_id: 'file-1' });
      legalHold.place.mockResolvedValue(false);

      await expect(
        service.erase(
          REQUEST_ID,
          { legal_hold: true, legal_hold_reason: 'Case 1/2569 pending' },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.anonymise).not.toHaveBeenCalled();
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

  describe('verification (ADR-090 §6)', () => {
    it('challenges the address ON THE MATCHED RECORD, not the one typed into the request', async () => {
      // The whole security property. The request says one thing; the held record says another, and
      // the record wins — otherwise this would prove control of a claimed address and nothing more.
      repo.findById.mockResolvedValue(openRequest({ subject_email: 'typed@example.co.th' }));
      repo.findMatches.mockResolvedValue([
        {
          source: 'crm.contacts',
          id: 'c1',
          fields: { name: 'Somchai', email: 'onfile@example.co.th' },
        },
      ]);
      verification.issue.mockResolvedValue({
        token: 'tok',
        tokenHash: 'hash',
        expiresAt: new Date(),
      });

      const result = await service.sendVerification(REQUEST_ID, ACTOR);

      expect(repo.recordChallenge).toHaveBeenCalledWith({
        requestId: REQUEST_ID,
        tokenHash: 'hash',
        sentTo: 'onfile@example.co.th',
      });
      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'onfile@example.co.th' }),
      );
      // Masked back to the admin: they need to know it went out, not to read the address off a
      // screen they may be sharing.
      expect(result.sent_to).toBe('o***@example.co.th');
    });

    it('masks to *** when the stored value is not an address it can split', async () => {
      // A CRM row's email column is free text; a value with no local part must not be echoed whole
      // to the admin just because the masker could not parse it.
      repo.findById.mockResolvedValue(openRequest());
      repo.findMatches.mockResolvedValue([
        { source: 'crm.contacts', id: 'c1', fields: { email: '@example.co.th' } },
      ]);
      verification.issue.mockResolvedValue({ token: 't', tokenHash: 'h', expiresAt: new Date() });

      await expect(service.sendVerification(REQUEST_ID, ACTOR)).resolves.toEqual({
        sent_to: '***',
      });
    });

    it('falls back to a vendor contact_email when the match is a vendor row', async () => {
      repo.findById.mockResolvedValue(openRequest());
      repo.findMatches.mockResolvedValue([
        {
          source: 'procurement.vendors',
          id: 'v1',
          fields: { vendor_name: 'ACME', contact_email: 'buyer@acme.co.th', contact_phone: null },
        },
      ]);
      verification.issue.mockResolvedValue({ token: 't', tokenHash: 'h', expiresAt: new Date() });

      await service.sendVerification(REQUEST_ID, ACTOR);
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'buyer@acme.co.th' }));
    });

    it('refuses when the held records carry no email — it will not fake a method it did not use', async () => {
      repo.findById.mockResolvedValue(openRequest());
      repo.findMatches.mockResolvedValue([
        { source: 'crm.leads', id: 'l1', fields: { contact_name: 'Somchai' } },
      ]);
      await expect(service.sendVerification(REQUEST_ID, ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(email.send).not.toHaveBeenCalled();
    });

    it('refuses to send when PUBLIC_WEB_URL is unset rather than mailing a dead link', async () => {
      delete process.env['PUBLIC_WEB_URL'];
      repo.findById.mockResolvedValue(openRequest());
      repo.findMatches.mockResolvedValue([
        { source: 'crm.contacts', id: 'c1', fields: { email: 'a@b.co' } },
      ]);
      verification.issue.mockResolvedValue({ token: 't', tokenHash: 'h', expiresAt: new Date() });
      await expect(service.sendVerification(REQUEST_ID, ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      process.env['PUBLIC_WEB_URL'] = 'https://app.example.test';
    });

    it('confirms once, and reports the second attempt as spent', async () => {
      verification.hashToken.mockResolvedValue('hash');
      repo.markVerifiedByTokenHash.mockResolvedValueOnce(true);
      await expect(service.confirmVerification('tok')).resolves.toEqual({ verified: true });

      repo.markVerifiedByTokenHash.mockResolvedValueOnce(false);
      await expect(service.confirmVerification('tok')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('blocks anonymisation until the subject is verified', async () => {
      // Anonymisation cannot be undone, so acting on an unproved request risks destroying a real
      // person's record on a stranger's say-so.
      repo.findById.mockResolvedValue(openRequest({ request_type: 'ERASURE', verified_at: null }));
      await expect(service.erase(REQUEST_ID, {}, ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.anonymise).not.toHaveBeenCalled();
    });
  });
});
