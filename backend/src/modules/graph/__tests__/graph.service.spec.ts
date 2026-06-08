// Graph Service — unit tests
// Tests that each query delegates to Neo4j session and maps records correctly.

import { ServiceUnavailableException } from '@nestjs/common';
import { GraphService } from '../graph.service';

const makeRecord = (data: Record<string, unknown>) => ({
  get: (key: string) => data[key],
});

const makeSession = (records: ReturnType<typeof makeRecord>[], shouldThrow = false) => ({
  run: jest.fn().mockImplementation(async () => {
    if (shouldThrow) throw new Error('Neo4j unavailable');
    return { records };
  }),
  close: jest.fn().mockResolvedValue(undefined),
});

const makeDriver = (session: ReturnType<typeof makeSession>) => ({
  session: jest.fn().mockReturnValue(session),
});

describe('GraphService', () => {
  const TENANT = 'tenant-1';
  const PROJECT = 'proj-1';
  const VENDOR = 'vendor-1';

  describe('getVendorsForProject', () => {
    it('returns mapped vendors from Neo4j', async () => {
      const records = [makeRecord({ vendorId: 'v-1', vendorName: 'ACME Corp' })];
      const session = makeSession(records);
      const svc = new GraphService(makeDriver(session) as never);

      const result = await svc.getVendorsForProject(PROJECT, TENANT);
      expect(result).toEqual([{ vendorId: 'v-1', vendorName: 'ACME Corp' }]);
      expect(session.close).toHaveBeenCalled();
    });

    it('throws ServiceUnavailableException on Neo4j error', async () => {
      const session = makeSession([], true);
      const svc = new GraphService(makeDriver(session) as never);

      await expect(svc.getVendorsForProject(PROJECT, TENANT)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(session.close).toHaveBeenCalled();
    });
  });

  describe('getSupplyChain', () => {
    it('returns mapped supply chain rows', async () => {
      const records = [
        makeRecord({
          materialId: 'm-1',
          description: 'Steel',
          vendorId: 'v-1',
          vendorName: 'ACME',
        }),
      ];
      const session = makeSession(records);
      const svc = new GraphService(makeDriver(session) as never);

      const result = await svc.getSupplyChain(PROJECT, TENANT);
      expect(result[0]).toMatchObject({ materialId: 'm-1', vendorId: 'v-1' });
      expect(session.close).toHaveBeenCalled();
    });

    it('throws ServiceUnavailableException on Neo4j error', async () => {
      const session = makeSession([], true);
      const svc = new GraphService(makeDriver(session) as never);

      await expect(svc.getSupplyChain(PROJECT, TENANT)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('getInspectionsForProject', () => {
    it('returns mapped inspection rows', async () => {
      const records = [
        makeRecord({ inspectionId: 'i-1', status: 'PASSED', inspectedAt: '2026-06-01' }),
      ];
      const session = makeSession(records);
      const svc = new GraphService(makeDriver(session) as never);

      const result = await svc.getInspectionsForProject(PROJECT, TENANT);
      expect(result[0]).toMatchObject({ inspectionId: 'i-1', status: 'PASSED' });
    });

    it('throws ServiceUnavailableException on Neo4j error', async () => {
      const session = makeSession([], true);
      const svc = new GraphService(makeDriver(session) as never);

      await expect(svc.getInspectionsForProject(PROJECT, TENANT)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('getProjectsForVendor', () => {
    it('returns mapped project rows for vendor', async () => {
      const records = [makeRecord({ projectId: 'p-1', projectName: 'Tower A' })];
      const session = makeSession(records);
      const svc = new GraphService(makeDriver(session) as never);

      const result = await svc.getProjectsForVendor(VENDOR, TENANT);
      expect(result[0]).toMatchObject({ projectId: 'p-1', projectName: 'Tower A' });
    });

    it('throws ServiceUnavailableException on Neo4j error', async () => {
      const session = makeSession([], true);
      const svc = new GraphService(makeDriver(session) as never);

      await expect(svc.getProjectsForVendor(VENDOR, TENANT)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('getInvoicesForVendor', () => {
    it('returns mapped invoice rows for vendor', async () => {
      const records = [
        makeRecord({ invoiceId: 'inv-1', amount: '50000', currency: 'THB', status: 'PAID' }),
      ];
      const session = makeSession(records);
      const svc = new GraphService(makeDriver(session) as never);

      const result = await svc.getInvoicesForVendor(VENDOR, TENANT);
      expect(result[0]).toMatchObject({ invoiceId: 'inv-1', currency: 'THB' });
    });

    it('throws ServiceUnavailableException on Neo4j error', async () => {
      const session = makeSession([], true);
      const svc = new GraphService(makeDriver(session) as never);

      await expect(svc.getInvoicesForVendor(VENDOR, TENANT)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
