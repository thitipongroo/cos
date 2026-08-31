// SearchIndexRepository — the row the indexer projects into OpenSearch (TDD OQ-22).
//
// One thing is worth asserting beyond "it returns the row": every query carries an explicit
// `tenant_id` predicate as well as running under RLS. §7.7 asks for both, and the reason is on the
// record — `finance.wht_rules` turned out to have no RLS policy at all (migration 20260822000001),
// and only a second predicate would have kept that from being a cross-tenant read. An indexer is the
// worst place to lose it: the wrong tenant's row would be written into a shared index and then
// returned to whoever searches.

import { ClsServiceManager } from 'nestjs-cls';
import { SearchIndexRepository } from '../search-index.repository';
import { CLS_TENANT_ID } from '../../../shared/context/cls-context';

const prisma = { $queryRaw: jest.fn() };
const db = { run: jest.fn((fn: (p: typeof prisma) => unknown) => fn(prisma)) };

function inTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const cls = ClsServiceManager.getClsService();
  return cls.run(async () => {
    cls.set(CLS_TENANT_ID, tenantId);
    return fn();
  });
}

/** The interpolated values of the last tagged-template query, in order. */
function paramsOf(): unknown[] {
  const [, ...params] = prisma.$queryRaw.mock.calls[0] as [string[], ...unknown[]];
  return params;
}

/** The SQL text of the last tagged-template query, with its holes closed up. */
function sqlOf(): string {
  const [parts] = prisma.$queryRaw.mock.calls[0] as [string[], ...unknown[]];
  return parts.join('?');
}

describe('SearchIndexRepository', () => {
  beforeEach(() => {
    prisma.$queryRaw.mockReset();
    db.run.mockClear();
  });

  const repo = () => new SearchIndexRepository(db as never);

  describe('findProject', () => {
    it('returns the row and scopes it to the CLS tenant', async () => {
      const row = { project_id: 'p-1', tenant_id: 't-1', project_name: 'Riverside' };
      prisma.$queryRaw.mockResolvedValue([row]);
      await inTenant('t-1', async () => {
        await expect(repo().findProject('p-1')).resolves.toEqual(row);
      });
      expect(sqlOf()).toContain('FROM projects.projects');
      expect(paramsOf()).toEqual(['p-1', 't-1']);
    });

    it('returns null when the id belongs to another tenant', async () => {
      // Same answer as "no such project", deliberately: an existence oracle across tenants is a
      // leak of its own, and the indexer has nothing useful to do with the distinction.
      prisma.$queryRaw.mockResolvedValue([]);
      await inTenant('t-1', async () => {
        await expect(repo().findProject('p-other')).resolves.toBeNull();
      });
    });
  });

  describe('findSiteReport', () => {
    it('returns the row', async () => {
      const row = { report_id: 'r-1', tenant_id: 't-1', summary: 'Slab poured' };
      prisma.$queryRaw.mockResolvedValue([row]);
      await inTenant('t-1', async () => {
        await expect(repo().findSiteReport('r-1')).resolves.toEqual(row);
      });
      expect(sqlOf()).toContain('FROM site_ops.site_reports');
      expect(paramsOf()).toEqual(['r-1', 't-1']);
    });

    it('returns null when there is no such report', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await inTenant('t-1', async () => {
        await expect(repo().findSiteReport('r-none')).resolves.toBeNull();
      });
    });
  });

  describe('findIssue', () => {
    it('returns the row', async () => {
      const row = { issue_id: 'i-1', tenant_id: 't-1', title: 'Scaffolding gap' };
      prisma.$queryRaw.mockResolvedValue([row]);
      await inTenant('t-1', async () => {
        await expect(repo().findIssue('i-1')).resolves.toEqual(row);
      });
      expect(sqlOf()).toContain('FROM site_ops.issues');
      expect(paramsOf()).toEqual(['i-1', 't-1']);
    });

    it('returns null when there is no such issue', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await inTenant('t-1', async () => {
        await expect(repo().findIssue('i-none')).resolves.toBeNull();
      });
    });
  });
});
