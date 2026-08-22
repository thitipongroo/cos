// Unit tests — SubjectRequestController (ADR-090).
//
// The controller is deliberately thin, so what these assert is the part that would be a security bug
// if it drifted: the actor always comes from the JWT-derived request, never from the body or a query
// param, and the search route passes only the request id — the identifiers are the row's, not the
// caller's.

import {
  SubjectRequestController,
  SubjectVerifyPublicController,
} from '../subject-request.controller';
import type { SubjectRequestService } from '../subject-request.service';
import type { TenantRequest } from '../../../tenant/tenant.middleware';

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';

const req = { tenantId: TENANT, userId: USER } as unknown as TenantRequest;

describe('SubjectRequestController', () => {
  let service: jest.Mocked<
    Pick<
      SubjectRequestService,
      | 'create'
      | 'list'
      | 'findMatches'
      | 'erase'
      | 'close'
      | 'sendVerification'
      | 'confirmVerification'
    >
  >;
  let controller: SubjectRequestController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      list: jest.fn(),
      findMatches: jest.fn(),
      erase: jest.fn(),
      close: jest.fn(),
      sendVerification: jest.fn(),
      confirmVerification: jest.fn(),
    } as unknown as typeof service;
    controller = new SubjectRequestController(service as unknown as SubjectRequestService);
  });

  it('create() takes the actor from the request, not the body', async () => {
    const dto = {
      request_type: 'ACCESS' as const,
      subject_email: 'a@b.co',
      received_at: '2026-08-14T09:00:00.000Z',
    };
    service.create.mockResolvedValue({} as never);
    await controller.create(dto, req);
    expect(service.create).toHaveBeenCalledWith(dto, USER);
  });

  it('list() forwards the status filter, and forwards undefined when omitted', async () => {
    service.list.mockResolvedValue([]);
    await controller.list('OPEN');
    expect(service.list).toHaveBeenCalledWith('OPEN');
    await controller.list();
    expect(service.list).toHaveBeenLastCalledWith(undefined);
  });

  it('matches() passes only the request id and the actor', async () => {
    // No identifier reaches the service from the caller — that is what makes the request row the
    // authorisation rather than a label on a search someone else chose (ADR-090 §4).
    service.findMatches.mockResolvedValue({ request_id: REQUEST_ID, matches: [], note: null });
    await controller.matches(REQUEST_ID, req);
    expect(service.findMatches).toHaveBeenCalledWith(REQUEST_ID, USER);
  });

  it('erase() passes only the request id and the actor', async () => {
    service.erase.mockResolvedValue({
      request_id: REQUEST_ID,
      anonymised: { contacts: 0, leads: 0, vendors: 0, workers: 0 },
      total: 0,
      archived_file_id: null,
    });
    await controller.erase(REQUEST_ID, {}, req);
    expect(service.erase).toHaveBeenCalledWith(REQUEST_ID, {}, USER);
  });

  it('close() forwards the body and the actor', async () => {
    const dto = { status: 'FULFILLED' as const, outcome_note: 'anonymised 2 rows' };
    service.close.mockResolvedValue({} as never);
    await controller.close(REQUEST_ID, dto, req);
    expect(service.close).toHaveBeenCalledWith(REQUEST_ID, dto, USER);
  });

  it('sendVerification() passes only the request id and the actor', async () => {
    service.sendVerification.mockResolvedValue({ sent_to: 'o***@b.co' });
    await controller.sendVerification(REQUEST_ID, req);
    expect(service.sendVerification).toHaveBeenCalledWith(REQUEST_ID, USER);
  });

  it('the public confirm route takes the token and nothing else', async () => {
    // No actor, no tenant: the subject has no account, and the guard derives the tenant from the
    // token's own signed claim (ADR-090 §6).
    const publicController = new SubjectVerifyPublicController(
      service as unknown as SubjectRequestService,
    );
    service.confirmVerification.mockResolvedValue({ verified: true });
    await publicController.confirm('tok');
    expect(service.confirmVerification).toHaveBeenCalledWith('tok');
  });
});
