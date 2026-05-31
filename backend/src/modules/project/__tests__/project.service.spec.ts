// Unit tests: ProjectService business rules
// QM-1: ≥80% line coverage, ≥70% branch coverage
// Dependencies mocked — DB and Kafka are external; state machine is pure.

import { Test } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ProjectService } from '../project.service';
import { ProjectRepository } from '../project.repository';
import type { ProjectRow } from '../project.repository';

jest.mock('@opensearch-project/opensearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockResolvedValue({}),
    search: jest.fn().mockResolvedValue({ body: { hits: { hits: [] } } }),
  })),
}));

jest.mock('@cos/shared', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

const mockRequest = {
  tenantId: 'tenant-uuid-001',
  tenantCode: 'acme_corp',
  user: { cos_user_id: 'user-uuid-001', cos_role: 'PROJECT_MANAGER' },
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
    list: jest.fn().mockResolvedValue({ items: [baseProject], nextCursor: null }),
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
      { provide: ProjectRepository, useValue: repo },
      { provide: REQUEST, useValue: { ...mockRequest, ...reqOverride } },
    ],
  }).compile();

  // REQUEST-scoped services must be resolved from the module context
  return module.resolve<ProjectService>(ProjectService);
}

describe('ProjectService', () => {
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
      expect(repo.update).toHaveBeenCalledWith('proj-uuid-001', { project_name: 'Updated' });
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
        user: { cos_user_id: 'user-uuid-001', cos_role: 'TENANT_ADMIN' },
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
        user: { cos_user_id: 'user-uuid-001', cos_role: 'TENANT_ADMIN' },
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
  });
});
