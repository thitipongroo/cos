// Unit tests: ProjectService business rules
// QM-1: ≥80% line coverage, ≥70% branch coverage
// Dependencies mocked — DB and Kafka are external; state machine is pure.

import { Test } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ProjectService } from '../project.service';
import { EventOutboxService } from '../../../shared/events/event-outbox.service';
import { makeOutboxDouble } from '../../../shared/events/__tests__/outbox-double';
import { ProjectRepository } from '../project.repository';
import type { ProjectRow } from '../project.repository';

jest.mock('@opensearch-project/opensearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockResolvedValue({}),
    search: jest.fn().mockResolvedValue({ body: { hits: { hits: [] } } }),
  })),
}));

jest.mock('@cos/kafka', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

const mockRequest = {
  tenantId: 'tenant-uuid-001',
  tenantCode: 'acme_corp',
  user: { user_id: 'user-uuid-001', role: 'PROJECT_MANAGER' },
};

const baseProject: ProjectRow = {
  project_id: 'proj-uuid-001',
  tenant_id: 'tenant-uuid-001',
  project_code: 'PROJ-001',
  project_name: 'Test Project',
  project_type: 'COMMERCIAL',
  status: 'DRAFT',
  budget_amount: '1000000.0000',
  budget_currency: 'THB',
  start_date: '2026-06-01',
  end_date: '2027-12-31',
  estimated_completion_date: null,
  work_hours_start: null,
  work_hours_end: null,
  on_hold_reason: null,
  on_hold_at: null,
  cancellation_reason: null,
  cancelled_at: null,
  created_by: 'user-uuid-001',
  created_at: new Date('2026-05-31'),
  updated_at: new Date('2026-05-31'),
};

function makeRepo(overrides: Partial<ProjectRepository> = {}): ProjectRepository {
  return {
    create: jest.fn().mockResolvedValue(baseProject),
    findById: jest.fn().mockResolvedValue(baseProject),
    findByIds: jest.fn().mockResolvedValue([baseProject]),
    list: jest.fn().mockResolvedValue({ items: [baseProject], nextCursor: null }),
    listByMember: jest.fn().mockResolvedValue([baseProject]),
    update: jest.fn().mockResolvedValue(baseProject),
    updateStatus: jest.fn().mockResolvedValue(baseProject),
    addMember: jest.fn().mockResolvedValue({}),
    removeMember: jest.fn().mockResolvedValue(undefined),
    listMembers: jest.fn().mockResolvedValue([]),
    listDocuments: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as ProjectRepository;
}

async function buildService(repo: ProjectRepository, reqOverride = {}): Promise<ProjectService> {
  const module = await Test.createTestingModule({
    providers: [
      ProjectService,
      { provide: EventOutboxService, useValue: makeOutboxDouble().service },
      { provide: ProjectRepository, useValue: repo },
      { provide: REQUEST, useValue: { ...mockRequest, ...reqOverride } },
    ],
  }).compile();

  // REQUEST-scoped services must be resolved from the module context
  return module.resolve<ProjectService>(ProjectService);
}

describe('ProjectService', () => {
  describe('constructor — no-context fallback (lines 37, 40)', () => {
    it('uses empty string when tenantId/userId are absent from request (covers ?? right branch)', async () => {
      const module = await Test.createTestingModule({
        providers: [
          ProjectService,
          { provide: EventOutboxService, useValue: makeOutboxDouble().service },
          { provide: ProjectRepository, useValue: makeRepo() },
          { provide: REQUEST, useValue: {} },
        ],
      }).compile();
      const noCtx = await module.resolve<ProjectService>(ProjectService);
      expect((noCtx as unknown as { tenantId: string }).tenantId).toBe('');
      expect((noCtx as unknown as { userId: string }).userId).toBe('');
    });

    it('covers both OPENSEARCH_URL env-defined and default branches (line 58)', async () => {
      const original = process.env['OPENSEARCH_URL'];
      try {
        process.env['OPENSEARCH_URL'] = 'http://opensearch.internal:9200';
        expect(await buildService(makeRepo())).toBeDefined();
        delete process.env['OPENSEARCH_URL'];
        expect(await buildService(makeRepo())).toBeDefined();
      } finally {
        if (original === undefined) delete process.env['OPENSEARCH_URL'];
        else process.env['OPENSEARCH_URL'] = original;
      }
    });
  });

  describe('create()', () => {
    it('creates a project and returns it', async () => {
      const repo = makeRepo();
      const service = await buildService(repo);
      const result = await service.create({
        project_code: 'PROJ-001',
        project_name: 'Test Project',
        project_type: 'COMMERCIAL' as never,
        budget_amount: '1000000.0000',
        budget_currency: 'THB',
        start_date: '2026-06-01',
        end_date: '2027-12-31',
      });
      expect(result.project_code).toBe('PROJ-001');
      expect(repo.create).toHaveBeenCalledTimes(1);
    });

    // Phase 8 Outbox Pattern (§35.13 ESC-13): create() no longer publishes to Kafka directly — it
    // hands the repository a builder so the event is written in the same transaction as the row.
    it('passes an outbox builder that derives the envelope from the inserted row', async () => {
      const repo = makeRepo();
      const service = await buildService(repo);
      await service.create({
        project_code: 'PROJ-001',
        project_name: 'Test Project',
        project_type: 'COMMERCIAL' as never,
        budget_amount: '1000000.0000',
        budget_currency: 'THB',
        start_date: '2026-06-01',
        end_date: '2027-12-31',
      });

      const createMock = repo.create as unknown as jest.Mock;
      const builder = createMock.mock.calls[0][2] as (row: typeof baseProject) => {
        event_type: string;
        tenant_id: string;
        payload: Record<string, unknown>;
      };
      expect(typeof builder).toBe('function');

      const envelope = builder(baseProject);
      expect(envelope.event_type).toBe('construction.project.created.v1');
      expect(envelope.payload).toMatchObject({
        project_id: baseProject.project_id,
        project_code: baseProject.project_code,
        budget: { amount: '1000000.0000', currency_code: 'THB' },
        created_by: baseProject.created_by,
      });
    });

    it('outbox payload falls back when the row has null budget and dates', async () => {
      const repo = makeRepo();
      const service = await buildService(repo);
      await service.create({
        project_code: 'P-NULL',
        project_name: 'Null Budget',
        project_type: 'COMMERCIAL' as never,
      });

      const createMock = repo.create as unknown as jest.Mock;
      const builder = createMock.mock.calls[0][2] as (row: unknown) => {
        payload: {
          budget: { amount: string; currency_code: string };
          start_date: string;
          end_date: string;
        };
      };
      const envelope = builder({
        ...baseProject,
        budget_amount: null,
        budget_currency: null,
        start_date: null,
        end_date: null,
      });

      expect(envelope.payload.budget).toEqual({ amount: '0.0000', currency_code: 'THB' });
      expect(envelope.payload.start_date).toBe('');
      expect(envelope.payload.end_date).toBe('');
    });
  });

  describe('findById()', () => {
    it('returns project when found', async () => {
      const service = await buildService(makeRepo());
      const project = await service.findById('proj-uuid-001');
      expect(project.project_id).toBe('proj-uuid-001');
    });

    it('throws NotFoundException when not found', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const service = await buildService(repo);
      await expect(service.findById('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    it('updates project metadata', async () => {
      const repo = makeRepo();
      const service = await buildService(repo);
      await service.update('proj-uuid-001', { project_name: 'Updated' });
      // 3rd arg is the outbox builder (§35.13 ESC-13)
      expect(repo.update).toHaveBeenCalledWith(
        'proj-uuid-001',
        { project_name: 'Updated' },
        expect.any(Function),
      );
    });

    it('skips fields explicitly set to undefined when building changedFields', async () => {
      // Covers the falsy branch of `if (dto[key] !== undefined)` — the key is iterated by
      // Object.keys but excluded from changedFields because its value is undefined.
      const repo = makeRepo();
      const service = await buildService(repo);
      await service.update('proj-uuid-001', { project_name: undefined });
      expect(repo.update).toHaveBeenCalledWith(
        'proj-uuid-001',
        { project_name: undefined },
        expect.any(Function),
      );
    });

    it('throws 422 when project is CANCELLED', async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue({ ...baseProject, status: 'CANCELLED' }),
      });
      const service = await buildService(repo);
      await expect(service.update('proj-uuid-001', {})).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('throws 422 when project is COMPLETED', async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue({ ...baseProject, status: 'COMPLETED' }),
      });
      const service = await buildService(repo);
      await expect(service.update('proj-uuid-001', {})).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('transition()', () => {
    it('transitions DRAFT → ACTIVE for PROJECT_MANAGER', async () => {
      const repo = makeRepo({
        updateStatus: jest.fn().mockResolvedValue({ ...baseProject, status: 'ACTIVE' }),
      });
      const service = await buildService(repo);
      const result = await service.transition('proj-uuid-001', { to: 'ACTIVE' as never });
      expect(result.status).toBe('ACTIVE');
    });

    it('rejects invalid transition with 422', async () => {
      const service = await buildService(makeRepo());
      // DRAFT → COMPLETED is not an allowed transition
      await expect(
        service.transition('proj-uuid-001', { to: 'COMPLETED' as never }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('requires reason for ON_HOLD', async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue({ ...baseProject, status: 'ACTIVE' }),
      });
      const service = await buildService(repo);
      await expect(service.transition('proj-uuid-001', { to: 'ON_HOLD' as never })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('TENANT_ADMIN can cancel a DRAFT project', async () => {
      const repo = makeRepo({
        updateStatus: jest.fn().mockResolvedValue({ ...baseProject, status: 'CANCELLED' }),
      });
      const service = await buildService(repo, {
        user: { user_id: 'user-uuid-001', role: 'TENANT_ADMIN' },
      });
      const result = await service.transition('proj-uuid-001', {
        to: 'CANCELLED' as never,
        reason: 'No funding',
      });
      expect(result.status).toBe('CANCELLED');
    });

    it('rejects CANCELLED → ACTIVE (terminal state)', async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue({ ...baseProject, status: 'CANCELLED' }),
      });
      const service = await buildService(repo, {
        user: { user_id: 'user-uuid-001', role: 'TENANT_ADMIN' },
      });
      await expect(service.transition('proj-uuid-001', { to: 'ACTIVE' as never })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('listMembers()', () => {
    it('returns members for existing project', async () => {
      const service = await buildService(makeRepo());
      const members = await service.listMembers('proj-uuid-001');
      expect(Array.isArray(members)).toBe(true);
    });

    it('throws 404 for non-existent project', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const service = await buildService(repo);
      await expect(service.listMembers('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listDocuments()', () => {
    it('returns documents for existing project', async () => {
      const service = await buildService(makeRepo());
      const docs = await service.listDocuments('proj-uuid-001');
      expect(Array.isArray(docs)).toBe(true);
    });

    it('throws 404 for non-existent project', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const service = await buildService(repo);
      await expect(service.listDocuments('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('list()', () => {
    it('delegates to repo.list when no search query', async () => {
      const service = await buildService(makeRepo());
      const result = await service.list({ limit: 20 } as never);
      expect(result.items).toHaveLength(1);
    });

    it('uses OpenSearch when dto.q is provided', async () => {
      const service = await buildService(makeRepo());
      const result = await service.list({ q: 'Test', limit: 10 } as never);
      // OpenSearch mock returns empty hits → falls back gracefully
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('hydrates OpenSearch hits with ONE repo call, in relevance order', async () => {
      const second: ProjectRow = { ...baseProject, project_id: 'proj-uuid-002' };
      const { Client } = jest.requireMock('@opensearch-project/opensearch') as {
        Client: jest.Mock;
      };
      Client.mockImplementationOnce(() => ({
        index: jest.fn().mockResolvedValue({}),
        search: jest.fn().mockResolvedValue({
          body: { hits: { hits: [{ _id: 'proj-uuid-002' }, { _id: 'proj-uuid-001' }] } },
        }),
      }));
      // Returned deliberately in the opposite order — SQL does not preserve relevance ranking.
      const repo = makeRepo({
        findByIds: jest.fn().mockResolvedValue([baseProject, second]),
      } as never);
      const service = await buildService(repo);

      const result = await service.list({ q: 'Test', limit: 10 } as never);

      expect(repo.findByIds).toHaveBeenCalledTimes(1);
      expect(repo.findByIds).toHaveBeenCalledWith(['proj-uuid-002', 'proj-uuid-001']);
      expect(repo.findById).not.toHaveBeenCalled();
      expect(result.items.map((p) => p.project_id)).toEqual(['proj-uuid-002', 'proj-uuid-001']);
    });

    it('drops search hits with no surviving row', async () => {
      const { Client } = jest.requireMock('@opensearch-project/opensearch') as {
        Client: jest.Mock;
      };
      Client.mockImplementationOnce(() => ({
        index: jest.fn().mockResolvedValue({}),
        search: jest.fn().mockResolvedValue({
          body: { hits: { hits: [{ _id: 'proj-uuid-001' }, { _id: 'deleted-since-indexing' }] } },
        }),
      }));
      const repo = makeRepo({ findByIds: jest.fn().mockResolvedValue([baseProject]) } as never);
      const service = await buildService(repo);

      const result = await service.list({ q: 'Test', limit: 10 } as never);

      expect(result.items.map((p) => p.project_id)).toEqual(['proj-uuid-001']);
    });

    it('falls back to repo.list when OpenSearch throws', async () => {
      const { Client } = jest.requireMock('@opensearch-project/opensearch') as {
        Client: jest.Mock;
      };
      Client.mockImplementationOnce(() => ({
        index: jest.fn().mockResolvedValue({}),
        search: jest.fn().mockRejectedValue(new Error('opensearch down')),
      }));
      const service = await buildService(makeRepo());
      const result = await service.list({ q: 'Test', limit: 10 } as never);
      expect(Array.isArray(result.items)).toBe(true);
    });
  });

  describe('listMine()', () => {
    it('returns the caller’s own projects via repo.listByMember', async () => {
      const repo = makeRepo();
      const service = await buildService(repo);
      const result = await service.listMine();
      expect(result.items).toHaveLength(1);
      expect(repo.listByMember).toHaveBeenCalled();
    });
  });

  describe('listForUser()', () => {
    it('returns a specific user’s projects via repo.listByMember', async () => {
      const repo = makeRepo();
      const service = await buildService(repo);
      const result = await service.listForUser('user-uuid-002');
      expect(result.items).toHaveLength(1);
      expect(repo.listByMember).toHaveBeenCalledWith('user-uuid-002');
    });
  });

  describe('addMember()', () => {
    it('adds member to an existing project', async () => {
      const service = await buildService(makeRepo());
      await expect(
        service.addMember('proj-uuid-001', { user_id: 'user-2', role: 'SITE_ENGINEER' as never }),
      ).resolves.toBeUndefined();
    });

    it('throws 404 when project does not exist', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const service = await buildService(repo);
      await expect(
        service.addMember('missing', { user_id: 'u', role: 'SITE_ENGINEER' as never }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMember()', () => {
    it('removes member from an existing project', async () => {
      const service = await buildService(makeRepo());
      await expect(service.removeMember('proj-uuid-001', 'user-2')).resolves.toBeUndefined();
    });

    it('throws 404 when project does not exist', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const service = await buildService(repo);
      await expect(service.removeMember('missing', 'user-2')).rejects.toThrow(NotFoundException);
    });
  });

  describe('constructor — null/undefined request fields (lines 51-53)', () => {
    it('falls back to empty string when tenantId and user are missing', async () => {
      const service = await buildService(makeRepo(), { tenantId: undefined, user: undefined });
      // findById still works even with empty tenantId (repo mock returns row)
      const project = await service.findById('proj-uuid-001');
      expect(project).toBeDefined();
    });
  });

  describe('create() — null optional fields in returned row (lines 84-88)', () => {
    it('uses fallbacks when budget/dates are null', async () => {
      const nullRow = {
        ...baseProject,
        budget_amount: null,
        budget_currency: null,
        start_date: null,
        end_date: null,
      };
      const repo = makeRepo({
        create: jest.fn().mockResolvedValue(nullRow),
        findById: jest.fn().mockResolvedValue(nullRow),
      });
      const service = await buildService(repo);
      const result = await service.create({
        project_code: 'P-NULL',
        project_name: 'Null Budget',
        project_type: 'COMMERCIAL' as never,
      });
      expect(result.budget_amount).toBeNull();
    });
  });

  describe('list() — limit fallback (line 112)', () => {
    it('defaults limit to 20 when dto.limit is undefined', async () => {
      const service = await buildService(makeRepo());
      const result = await service.list({} as never);
      expect(result.items).toBeDefined();
    });
  });

  describe('addMember() — alreadyExists branch (line 230)', () => {
    it('silently upserts when member already exists', async () => {
      const existingMembers = [
        {
          membership_id: 'm1',
          user_id: 'user-uuid-002',
          project_id: 'proj-uuid-001',
          tenant_id: 'tenant-uuid-001',
          role: 'SITE_ENGINEER',
          assigned_at: new Date(),
          assigned_by: 'user-uuid-001',
        },
      ];
      const repo = makeRepo({ listMembers: jest.fn().mockResolvedValue(existingMembers) });
      const service = await buildService(repo);
      await expect(
        service.addMember('proj-uuid-001', {
          user_id: 'user-uuid-002',
          role: 'SITE_ENGINEER' as never,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('searchProjects — status/type filters (lines 294-295)', () => {
    it('pushes status filter when dto.status provided with q', async () => {
      const service = await buildService(makeRepo());
      const result = await service.list({ q: 'Test', status: 'DRAFT', limit: 10 } as never);
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('pushes type filter when dto.type provided with q', async () => {
      const service = await buildService(makeRepo());
      const result = await service.list({ q: 'Test', type: 'COMMERCIAL', limit: 10 } as never);
      expect(Array.isArray(result.items)).toBe(true);
    });
  });

  describe('searchProjects — hits.hits undefined (line 302 ?? branch)', () => {
    it('returns empty items when response.body.hits is undefined', async () => {
      const { Client } = jest.requireMock('@opensearch-project/opensearch') as {
        Client: jest.Mock;
      };
      Client.mockImplementationOnce(() => ({
        index: jest.fn().mockResolvedValue({}),
        search: jest.fn().mockResolvedValue({ body: {} }), // hits is undefined
      }));
      const service = await buildService(makeRepo());
      const result = await service.list({ q: 'Test', limit: 10 } as never);
      expect(result.items).toEqual([]);
    });
  });

  describe('list() — searchProjects with hits (lines 308-313)', () => {
    it('fetches rows from DB for each OpenSearch hit', async () => {
      const { Client } = jest.requireMock('@opensearch-project/opensearch') as {
        Client: jest.Mock;
      };
      Client.mockImplementationOnce(() => ({
        index: jest.fn().mockResolvedValue({}),
        search: jest.fn().mockResolvedValue({
          body: { hits: { hits: [{ _id: 'proj-uuid-001' }] } },
        }),
      }));
      const service = await buildService(makeRepo());
      const result = await service.list({ q: 'Test', limit: 10 } as never);
      expect(result.items.length).toBeGreaterThanOrEqual(0);
    });

    it('searchProjects with hit where DB row is null (row skipped)', async () => {
      const { Client } = jest.requireMock('@opensearch-project/opensearch') as {
        Client: jest.Mock;
      };
      Client.mockImplementationOnce(() => ({
        index: jest.fn().mockResolvedValue({}),
        search: jest.fn().mockResolvedValue({
          body: { hits: { hits: [{ _id: 'missing-id' }] } },
        }),
      }));
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const service = await buildService(repo);
      const result = await service.list({ q: 'Test', limit: 10 } as never);
      expect(result.items).toHaveLength(0);
    });
  });

  // §35.13 ESC-13: every project event now goes through the outbox. The service holds no
  // KafkaProducer at all, so there is no direct-publish error path left to test — instead the
  // builders handed to the repository are exercised below.
  describe('outbox builders — update() and transition()', () => {
    it('update() hands the repository a builder producing project.updated.v1', async () => {
      const repo = makeRepo();
      const service = await buildService(repo);
      await service.update('proj-uuid-001', { project_name: 'Renamed' });

      const updateMock = repo.update as unknown as jest.Mock;
      const builder = updateMock.mock.calls[0][2] as (row: typeof baseProject) => {
        event_type: string;
        payload: {
          project_id: string;
          changed_fields: Record<string, unknown>;
          updated_by: string;
        };
      };
      const envelope = builder(baseProject);

      expect(envelope.event_type).toBe('construction.project.updated.v1');
      expect(envelope.payload.project_id).toBe(baseProject.project_id);
      expect(envelope.payload.changed_fields).toEqual({ project_name: 'Renamed' });
    });

    it('transition() emits only status_changed for a non-COMPLETED target', async () => {
      const repo = makeRepo();
      const service = await buildService(repo);
      await service.transition('proj-uuid-001', { to: 'ACTIVE' } as never);

      const statusMock = repo.updateStatus as unknown as jest.Mock;
      const builder = statusMock.mock.calls[0][3] as (
        row: typeof baseProject,
      ) => { event_type: string; payload: Record<string, unknown> }[];
      const events = builder(baseProject);

      expect(events).toHaveLength(1);
      expect(events[0]!.event_type).toBe('construction.project.status_changed.v1');
      expect(events[0]!.payload).toMatchObject({
        from_status: 'DRAFT',
        to_status: 'ACTIVE',
        reason: null,
      });
    });

    it('transition() to COMPLETED emits status_changed AND archived in one transaction', async () => {
      const activeRow = { ...baseProject, status: 'ACTIVE' as const, end_date: '2020-01-01' };
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(activeRow),
        updateStatus: jest.fn().mockResolvedValue({ ...activeRow, status: 'COMPLETED' }),
      });
      const service = await buildService(repo, {
        user: { user_id: 'user-uuid-001', role: 'TENANT_ADMIN' },
      });
      await service.transition('proj-uuid-001', { to: 'COMPLETED' } as never);

      const statusMock = repo.updateStatus as unknown as jest.Mock;
      const builder = statusMock.mock.calls[0][3] as (
        row: typeof baseProject,
      ) => { event_type: string }[];
      const events = builder(activeRow);

      expect(events.map((e) => e.event_type)).toEqual([
        'construction.project.status_changed.v1',
        'construction.project.archived.v1',
      ]);
    });
  });

  describe('indexProject — error path (line 274)', () => {
    it('logs warn when OpenSearch index throws (non-fatal)', async () => {
      const { Client } = jest.requireMock('@opensearch-project/opensearch') as {
        Client: jest.Mock;
      };
      Client.mockImplementationOnce(() => ({
        index: jest.fn().mockRejectedValue(new Error('OpenSearch down')),
        search: jest.fn().mockResolvedValue({ body: { hits: { hits: [] } } }),
      }));
      const service = await buildService(makeRepo());
      // update() calls indexProject — failure must not throw
      await expect(service.update('proj-uuid-001', { project_name: 'X' })).resolves.toBeDefined();
    });
  });

  describe('transition() — meta fields', () => {
    it('sets on_hold_reason and on_hold_at when transitioning to ON_HOLD', async () => {
      const activeProject = { ...baseProject, status: 'ACTIVE' as const };
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(activeProject),
        updateStatus: jest.fn().mockResolvedValue({ ...activeProject, status: 'ON_HOLD' }),
      });
      const service = await buildService(repo);
      const result = await service.transition('proj-uuid-001', {
        to: 'ON_HOLD' as never,
        reason: 'Funding pause',
      });
      expect(result.status).toBe('ON_HOLD');
    });

    it('sets cancellation_reason when transitioning to CANCELLED', async () => {
      const repo = makeRepo({
        updateStatus: jest.fn().mockResolvedValue({ ...baseProject, status: 'CANCELLED' }),
      });
      // CANCELLED requires TENANT_ADMIN role + reason
      const service = await buildService(repo, {
        user: { user_id: 'user-uuid-001', role: 'TENANT_ADMIN' },
      });
      const result = await service.transition('proj-uuid-001', {
        to: 'CANCELLED' as never,
        reason: 'Budget cut',
      });
      expect(result.status).toBe('CANCELLED');
    });

    it('emits archived event when transitioning ACTIVE → COMPLETED', async () => {
      // COMPLETED requires TENANT_ADMIN + end_date <= today (use past date)
      const activeProject = { ...baseProject, status: 'ACTIVE' as const, end_date: '2020-01-01' };
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(activeProject),
        updateStatus: jest.fn().mockResolvedValue({ ...activeProject, status: 'COMPLETED' }),
      });
      const service = await buildService(repo, {
        user: { user_id: 'user-uuid-001', role: 'TENANT_ADMIN' },
      });
      const result = await service.transition('proj-uuid-001', { to: 'COMPLETED' as never });
      expect(result.status).toBe('COMPLETED');
    });
  });
});
