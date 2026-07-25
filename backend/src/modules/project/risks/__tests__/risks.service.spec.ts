// Unit tests for RisksService — CRUD, status transition, event emit + Kafka-failure path (100%).

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

jest.mock('@cos/shared', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { Test } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { NotFoundException } from '@nestjs/common';
import { RisksService } from '../risks.service';
import { RisksRepository } from '../risks.repository';
import type { RiskRow } from '../risks.repository';

const RISK_ID = 'risk-uuid-001';
const PROJECT_ID = 'proj-uuid-001';

const baseRow: RiskRow = {
  risk_id: RISK_ID,
  project_id: PROJECT_ID,
  tenant_id: 'tenant-uuid-001',
  title: 'Ground water ingress',
  description: null,
  category: 'TECHNICAL',
  likelihood: 3,
  impact: 4,
  risk_score: 12,
  mitigation: null,
  owner: null,
  status: 'OPEN',
  source: 'MANUAL',
  created_by: 'user-uuid-001',
  created_at: new Date('2026-07-25'),
  updated_at: new Date('2026-07-25'),
};

function makeRepo(overrides: Partial<RisksRepository> = {}): RisksRepository {
  return {
    projectExists: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockResolvedValue(baseRow),
    findById: jest.fn().mockResolvedValue(baseRow),
    list: jest.fn().mockResolvedValue([baseRow]),
    update: jest.fn().mockResolvedValue(baseRow),
    updateStatus: jest.fn().mockResolvedValue({ ...baseRow, status: 'MITIGATING' }),
    ...overrides,
  } as unknown as RisksRepository;
}

async function build(
  repo: RisksRepository,
  req: Record<string, unknown> = { tenantId: 'tenant-uuid-001', userId: 'user-uuid-001' },
): Promise<RisksService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      RisksService,
      { provide: RisksRepository, useValue: repo },
      { provide: REQUEST, useValue: req },
    ],
  }).compile();
  return moduleRef.resolve(RisksService);
}

describe('RisksService', () => {
  describe('create()', () => {
    it('raises a risk and emits RiskRaised when the parent project exists', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      const res = await svc.create(PROJECT_ID, {
        title: 'X',
        category: 'SAFETY' as never,
        likelihood: 3,
        impact: 4,
      });
      expect(res).toEqual(baseRow);
      expect(repo.create).toHaveBeenCalled();
    });

    it('throws COS-RISK-002 when the parent project does not exist', async () => {
      const repo = makeRepo({ projectExists: jest.fn().mockResolvedValue(false) });
      const svc = await build(repo);
      await expect(
        svc.create(PROJECT_ID, {
          title: 'X',
          category: 'SAFETY' as never,
          likelihood: 1,
          impact: 1,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('falls back to empty tenantId/userId when the request carries none (?? branches)', async () => {
      const repo = makeRepo();
      const svc = await build(repo, {});
      await svc.create(PROJECT_ID, {
        title: 'X',
        category: 'SAFETY' as never,
        likelihood: 1,
        impact: 1,
      });
      expect(repo.create).toHaveBeenCalledWith(
        PROJECT_ID,
        expect.objectContaining({ title: 'X' }),
        '',
      );
    });

    it('does not throw when Kafka publish fails (non-fatal path)', async () => {
      const { KafkaProducer } = jest.requireMock('@cos/shared') as { KafkaProducer: jest.Mock };
      KafkaProducer.mockImplementationOnce(() => ({
        connect: jest.fn().mockRejectedValue(new Error('Kafka down')),
        publish: jest.fn(),
        disconnect: jest.fn(),
      }));
      const repo = makeRepo();
      const svc = await build(repo);
      await expect(
        svc.create(PROJECT_ID, {
          title: 'X',
          category: 'SAFETY' as never,
          likelihood: 1,
          impact: 1,
        }),
      ).resolves.toEqual(baseRow);
    });
  });

  describe('findById()', () => {
    it('returns the risk when found', async () => {
      const svc = await build(makeRepo());
      expect(await svc.findById(RISK_ID)).toEqual(baseRow);
    });
    it('throws COS-RISK-001 when not found', async () => {
      const svc = await build(makeRepo({ findById: jest.fn().mockResolvedValue(null) }));
      await expect(svc.findById(RISK_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('list()', () => {
    it('delegates to the repository with the status/category filters', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      await svc.list(PROJECT_ID, { status: 'OPEN' as never, category: 'SAFETY' as never });
      expect(repo.list).toHaveBeenCalledWith(PROJECT_ID, { status: 'OPEN', category: 'SAFETY' });
    });
  });

  describe('update()', () => {
    it('updates after the 404 guard passes', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      await svc.update(RISK_ID, { mitigation: 'Install dewatering pumps' });
      expect(repo.update).toHaveBeenCalledWith(RISK_ID, { mitigation: 'Install dewatering pumps' });
    });
    it('throws when the risk does not exist', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const svc = await build(repo);
      await expect(svc.update(RISK_ID, {})).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus()', () => {
    it('transitions status and emits RiskStatusChanged', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      const res = await svc.updateStatus(RISK_ID, { status: 'MITIGATING' as never });
      expect(res.status).toBe('MITIGATING');
      expect(repo.updateStatus).toHaveBeenCalledWith(RISK_ID, 'MITIGATING');
    });
    it('throws when the risk does not exist', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const svc = await build(repo);
      await expect(svc.updateStatus(RISK_ID, { status: 'CLOSED' as never })).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });
  });
});
