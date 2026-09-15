// Unit tests — the two central price controllers, the adapter stub, and the error helpers (ADR-061).

import { ClsServiceManager } from 'nestjs-cls';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@cos/rbac';
import { CosRole } from '@cos/types';
import {
  EGP_ADAPTER_NAME,
  EgpCentralPriceAdapter,
} from '../adapters/egp-central-price-adapter.stub';
import { centralPriceUnavailable } from '../public/boq-central-price';
import { CentralPricesAdminController, TEMPLATE_CSV } from '../central-prices-admin.controller';
import type { CentralPricesAdminService } from '../central-prices-admin.service';
import { CentralPricesController, TENANT_READ_ROLES } from '../central-prices.controller';
import type { CentralPriceCatalogService } from '../central-price-catalog.service';

const TENANT = 'bbbbbbbb-0000-4000-8000-000000000001';
const ACTOR = 'bbbbbbbb-0000-4000-8000-000000000002';
const JUSTIFICATION = 'Comptroller General circular for 2569 published';

const adminSvc = {
  list: jest.fn(),
  syncStatus: jest.fn(),
  importFile: jest.fn(),
  sync: jest.fn(),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a hand-built multipart double
function multipartRequest(parts: any[], auth: Record<string, string> = {}) {
  return {
    ...auth,
    isMultipart: () => true,
    parts: () =>
      (async function* () {
        for (const p of parts) yield p;
      })() as AsyncGenerator<never>,
  };
}

describe('CentralPricesAdminController', () => {
  const controller = new CentralPricesAdminController(
    adminSvc as unknown as CentralPricesAdminService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('is SYSTEM_ADMIN-only at class level', () => {
    const roles = new Reflector().get<CosRole[]>(ROLES_KEY, CentralPricesAdminController);
    expect(roles).toEqual([CosRole.SYSTEM_ADMIN]);
  });

  it('list and syncStatus delegate', async () => {
    adminSvc.list.mockResolvedValue({ rows: [] });
    adminSvc.syncStatus.mockResolvedValue({ adapter: {} });
    await expect(controller.list({ q: 'a' })).resolves.toEqual({ rows: [] });
    expect(adminSvc.list).toHaveBeenCalledWith({ q: 'a' });
    await expect(controller.syncStatus()).resolves.toEqual({ adapter: {} });
  });

  it('template.csv is the header row only, as a CSV attachment', () => {
    const res = { header: jest.fn() };
    expect(controller.template(res as never)).toBe(
      'code,description,category,unit,central_price,currency_code\r\n',
    );
    expect(TEMPLATE_CSV.split('\r\n').filter(Boolean)).toHaveLength(1);
    expect(res.header).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.header).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="central-prices-template.csv"',
    );
  });

  it('import reads the form, validates the fields, and passes the caller from the request', async () => {
    adminSvc.importFile.mockResolvedValue({ run_id: 'r' });
    const req = multipartRequest(
      [
        { type: 'field', fieldname: 'effective_period', value: '2569' },
        { type: 'field', fieldname: 'justification', value: JUSTIFICATION },
        {
          type: 'file',
          fieldname: 'file',
          filename: 'p.csv',
          toBuffer: async () => Buffer.from('x'),
        },
      ],
      { userId: ACTOR, tenantId: TENANT },
    );

    await expect(controller.importFile(req)).resolves.toEqual({ run_id: 'r' });
    expect(adminSvc.importFile).toHaveBeenCalledWith(
      { actorId: ACTOR, tenantId: TENANT },
      {
        justification: JUSTIFICATION,
        effective_period: '2569',
        source_ref: null,
        file: { filename: 'p.csv', bytes: Buffer.from('x') },
      },
    );
  });

  it('import keeps a given source_ref, and 400s on invalid fields before calling the service', async () => {
    adminSvc.importFile.mockResolvedValue({});
    const file = {
      type: 'file',
      fieldname: 'file',
      filename: 'p.csv',
      toBuffer: async () => Buffer.from('x'),
    };
    await controller.importFile(
      multipartRequest(
        [
          { type: 'field', fieldname: 'effective_period', value: '2569' },
          { type: 'field', fieldname: 'source_ref', value: 'ว 123' },
          { type: 'field', fieldname: 'justification', value: JUSTIFICATION },
          file,
        ],
        { userId: ACTOR, tenantId: TENANT },
      ),
    );
    expect(adminSvc.importFile.mock.calls[0][1]).toMatchObject({ source_ref: 'ว 123' });

    adminSvc.importFile.mockClear();
    await expect(
      controller.importFile(
        multipartRequest([{ type: 'field', fieldname: 'effective_period', value: '2569' }, file]),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(adminSvc.importFile).not.toHaveBeenCalled();
  });

  it('sync falls back to the CLS context when the request carries no ids (Fastify)', async () => {
    adminSvc.sync.mockResolvedValue({ outcome: 'NOT_CONFIGURED' });
    const cls = ClsServiceManager.getClsService();
    await cls.run(async () => {
      cls.set('tenantId', TENANT);
      cls.set('userId', ACTOR);
      await controller.sync({ justification: JUSTIFICATION }, {});
    });
    expect(adminSvc.sync).toHaveBeenCalledWith({ actorId: ACTOR, tenantId: TENANT }, JUSTIFICATION);
  });
});

describe('CentralPricesController (tenant read)', () => {
  it('grants every tenant role and not SYSTEM_ADMIN', () => {
    const roles = new Reflector().get<CosRole[]>(
      ROLES_KEY,
      CentralPricesController.prototype.search,
    );
    expect(roles).toEqual(TENANT_READ_ROLES);
    expect(roles).not.toContain(CosRole.SYSTEM_ADMIN);
    const tenantRoles = Object.values(CosRole).filter((r) => r !== CosRole.SYSTEM_ADMIN);
    expect([...roles].sort()).toEqual([...tenantRoles].sort());
  });

  it('delegates the search', async () => {
    const catalog = {
      searchPublished: jest.fn().mockResolvedValue({ rows: [], next_cursor: null }),
    };
    const controller = new CentralPricesController(
      catalog as unknown as CentralPriceCatalogService,
    );
    await expect(controller.search({ code: 'A' })).resolves.toEqual({
      rows: [],
      next_cursor: null,
    });
    expect(catalog.searchPublished).toHaveBeenCalledWith({ code: 'A' });
  });
});

describe('EgpCentralPriceAdapter (stub, D9)', () => {
  it('is not configured and reports NOT_CONFIGURED without any network call', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const stub = new EgpCentralPriceAdapter();
    expect(stub.name).toBe(EGP_ADAPTER_NAME);
    expect(stub.isConfigured()).toBe(false);
    await expect(stub.fetch()).resolves.toEqual({
      outcome: 'NOT_CONFIGURED',
      message: expect.stringContaining('not configured'),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('central price error helpers', () => {
  it('omits details when none are given', () => {
    expect(centralPriceUnavailable('m').getResponse()).toEqual({
      error: {
        code: 'COS-CPRICE-006',
        message: 'm',
        messageKey: 'boq.centralPrice.error.unavailable',
      },
    });
  });
});
