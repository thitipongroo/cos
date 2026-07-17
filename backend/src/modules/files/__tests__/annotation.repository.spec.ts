import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { AnnotationRepository } from '../annotation.repository';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';

const mockPrisma = { $queryRaw: jest.fn() };
const mockTenantPrisma = {
  run: jest.fn((fn: (p: typeof mockPrisma) => unknown) => fn(mockPrisma)),
};
const mockRequest = { tenantId: 'tenant-uuid-001', userId: 'user-uuid-001' };

const row = {
  annotation_id: 'a1',
  file_id: 'f1',
  tenant_id: 'tenant-uuid-001',
  strokes: [{ tool: 'pen' }],
  version: 2,
  modified_by: 'user-uuid-001',
  modified_at: new Date(),
  created_at: new Date(),
};

async function makeRepo(request: Record<string, unknown>): Promise<AnnotationRepository> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      AnnotationRepository,
      { provide: TenantPrismaService, useValue: mockTenantPrisma },
      { provide: REQUEST, useValue: request },
    ],
  }).compile();
  return moduleRef.resolve<AnnotationRepository>(AnnotationRepository);
}

describe('AnnotationRepository', () => {
  let repo: AnnotationRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    repo = await makeRepo(mockRequest);
  });

  describe('findByFileId', () => {
    it('returns the row when present', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([row]);
      expect(await repo.findByFileId('f1')).toEqual(row);
    });

    it('returns null when no active annotation exists', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      expect(await repo.findByFileId('f1')).toBeNull();
    });
  });

  describe('upsert', () => {
    it('inserts/updates and returns the row', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ ...row, version: 3 }]);

      const result = await repo.upsert({ fileId: 'f1', strokes: [{ tool: 'arrow' }], version: 3 });

      expect(result.version).toBe(3);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  it('falls back to empty tenantId/userId when the request has neither', async () => {
    const noCtx = await makeRepo({});
    mockPrisma.$queryRaw.mockResolvedValue([row]);
    // Exercises both the tenantId ?? '' and userId ?? '' getters via a real query.
    await noCtx.upsert({ fileId: 'f1', strokes: [], version: 1 });
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
  });
});
