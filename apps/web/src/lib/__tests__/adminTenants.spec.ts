import {
  connectionState,
  dbUrlPort,
  PAGE_SIZE,
  PROVISIONING_STATES,
  errorKeyForStatus,
  filterTenants,
  initials,
  pageNumbers,
  pageOf,
  paginate,
  provisioningByTenant,
  provisioningView,
  statusView,
  tenantMetrics,
  tenantsAtGate,
  type TenantListRow,
} from '../adminTenants';

const NOW = new Date('2026-09-14T12:00:00Z');

function tenant(over: Partial<TenantListRow>): TenantListRow {
  return {
    tenant_id: 't',
    tenant_code: 'code',
    tenant_name: 'Name',
    keycloak_realm: 'construction-os-dev',
    plan_type: 'STARTER',
    is_active: true,
    data_region: 'ap-southeast-1',
    created_at: '2026-01-01T00:00:00Z',
    dedicated_db_host: null,
    ...over,
  };
}

const A = tenant({
  tenant_id: 'a',
  tenant_code: 'bkk_metro_corp',
  tenant_name: 'Bangkok Metro Transit Corp',
  plan_type: 'ENTERPRISE',
  data_region: 'ap-southeast-7',
  dedicated_db_host: 'db-ent-042.cos.internal',
  created_at: '2026-09-10T00:00:00Z',
});
const B = tenant({
  tenant_id: 'b',
  tenant_code: 'apex_construct',
  tenant_name: 'Apex Construction',
  plan_type: 'PROFESSIONAL',
  is_active: false,
});
const C = tenant({ tenant_id: 'c', tenant_code: 'north_build', plan_type: 'ENTERPRISE' });

describe('provisioningView', () => {
  it('reads no run as Active for an active tenant and as — for an inactive one (Q3)', () => {
    expect(provisioningView(undefined, true)).toEqual({
      labelKey: 'admin.provisioning.active',
      tone: 'ready',
    });
    expect(provisioningView(undefined, false)).toEqual({
      labelKey: 'admin.provisioning.none',
      tone: 'none',
    });
  });

  it('tells an unreadable run and an unrecognised state apart', () => {
    expect(provisioningView(null, true)).toEqual({
      labelKey: 'admin.provisioning.unreadable',
      tone: 'unknown',
    });
    expect(provisioningView('SOMETHING_NEW', true)).toEqual({
      labelKey: 'admin.provisioning.unrecognised',
      tone: 'unknown',
    });
  });

  it.each([
    ['COMPLETED', 'ready'],
    ['AWAITING_APPROVAL', 'gate'],
    ['ABORTING', 'stopped'],
    ['ABORTED', 'stopped'],
    ['CREATING_RDS', 'working'],
    ['PROVISIONING_TOPICS', 'working'],
  ])('%s reads as %s, under its own label key', (state, tone) => {
    expect(provisioningView(state, true)).toEqual({
      labelKey: `admin.provisioning.state.${state}`,
      tone,
    });
  });

  it('knows every §34.3 state plus PROVISIONING_TOPICS', () => {
    expect(PROVISIONING_STATES).toHaveLength(10);
  });
});

describe('dbUrlPort', () => {
  it('reads the port a URL names', () => {
    expect(dbUrlPort('postgresql://u:p@db-ent-042.cos.internal:6543/bkk')).toBe('6543');
  });

  it("falls back to PostgreSQL's default when the URL names none", () => {
    expect(dbUrlPort('postgresql://u:p@db-ent-042.cos.internal/bkk')).toBe('5432');
  });

  it('has no port for a value that is not a URL', () => {
    expect(dbUrlPort('not a url')).toBeNull();
  });
});

describe('statusView', () => {
  it('reads a run at the gate as Transit, whatever is_active says', () => {
    expect(statusView('AWAITING_APPROVAL', true)).toEqual({
      labelKey: 'admin.status.transit',
      tone: 'transit',
    });
  });

  it.each([
    'CREATING_RDS',
    'RUNNING_MIGRATIONS',
    'ASSIGNING_DB',
    'MIGRATING_DATA',
    'VERIFYING',
    'PROVISIONING_TOPICS',
    'ABORTING',
  ])('reads %s, a run in progress, as Pending', (state) => {
    expect(statusView(state, true)).toEqual({ labelKey: 'admin.status.pending', tone: 'pending' });
  });

  it.each([undefined, null, 'COMPLETED', 'ABORTED', 'SOMETHING_NEW'])(
    'falls through to is_active for %s',
    (state) => {
      expect(statusView(state, true)).toEqual({ labelKey: 'admin.status.active', tone: 'active' });
      expect(statusView(state, false)).toEqual({
        labelKey: 'admin.status.inactive',
        tone: 'inactive',
      });
    },
  );
});

describe('provisioningByTenant', () => {
  it('keys state by tenant and treats a missing list as empty', () => {
    const map = provisioningByTenant([{ tenant_id: 'a', workflow_state: null }]);
    expect(map.has('a')).toBe(true);
    expect(map.get('a')).toBeNull();
    expect(provisioningByTenant(undefined).size).toBe(0);
  });
});

describe('tenantMetrics', () => {
  it('counts only what the lists say', () => {
    expect(
      tenantMetrics(
        [A, B, C],
        [
          { tenant_id: 'a', workflow_state: 'COMPLETED' },
          { tenant_id: 'c', workflow_state: 'AWAITING_APPROVAL' },
        ],
        NOW,
      ),
    ).toEqual({
      total: 3,
      active: 2,
      inactive: 1,
      createdThisWeek: 1,
      dedicated: 1,
      awaitingGate: 1,
    });
  });

  it('counts no gates when provisioning has not loaded', () => {
    expect(tenantMetrics([A], undefined, NOW).awaitingGate).toBe(0);
  });
});

describe('filterTenants', () => {
  const all = [A, B, C];

  it('matches code, name, host and region, case-insensitively', () => {
    expect(filterTenants(all, 'BKK_', 'ALL')).toEqual([A]);
    expect(filterTenants(all, 'apex', 'ALL')).toEqual([B]);
    expect(filterTenants(all, 'ent-042', 'ALL')).toEqual([A]);
    expect(filterTenants(all, 'southeast-7', 'ALL')).toEqual([A]);
  });

  it('applies the plan chip, and a blank query matches everything', () => {
    expect(filterTenants(all, '   ', 'ENTERPRISE')).toEqual([A, C]);
    expect(filterTenants(all, '', 'ALL')).toEqual(all);
    expect(filterTenants(all, 'apex', 'ENTERPRISE')).toEqual([]);
  });
});

describe('paginate', () => {
  const rows = Array.from({ length: 23 }, (_, i) => i);

  it('slices a middle page and reports its range', () => {
    expect(paginate(rows, 2, 10)).toEqual({
      rows: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
      page: 2,
      pageCount: 3,
      from: 11,
      to: 20,
      total: 23,
    });
  });

  it('clamps an out-of-range page, both ways', () => {
    expect(paginate(rows, 99, 10).page).toBe(3);
    expect(paginate(rows, 0, 10).page).toBe(1);
  });

  it('reports an empty list as one empty page from 0', () => {
    expect(paginate([], 1)).toEqual({ rows: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
  });
});

describe('pageNumbers', () => {
  it('draws "1 2 3 … 35" on the first page', () => {
    expect(pageNumbers(1, 35)).toEqual([1, 2, 'ellipsis', 35]);
    expect(pageNumbers(2, 35)).toEqual([1, 2, 3, 'ellipsis', 35]);
  });

  it('puts an ellipsis on both sides of a middle page', () => {
    expect(pageNumbers(10, 35)).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 35]);
  });

  it('draws a single page once', () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
  });
});

describe('pageOf', () => {
  const rows = Array.from({ length: 25 }, (_, i) => tenant({ tenant_code: `t${i}` }));

  it('finds the page a code is on, and falls back to page 1', () => {
    expect(pageOf(rows, 't0', 10)).toBe(1);
    expect(pageOf(rows, 't21', 10)).toBe(3);
    expect(pageOf(rows, 'missing', 10)).toBe(1);
  });

  it('uses PAGE_SIZE when no page size is given', () => {
    expect(pageOf(rows, `t${PAGE_SIZE}`)).toBe(2);
  });
});

describe('tenantsAtGate', () => {
  it('returns tenants whose run is AWAITING_APPROVAL, in list order', () => {
    expect(
      tenantsAtGate(
        [A, B, C],
        [
          { tenant_id: 'c', workflow_state: 'AWAITING_APPROVAL' },
          { tenant_id: 'a', workflow_state: 'AWAITING_APPROVAL' },
          { tenant_id: 'b', workflow_state: null },
        ],
      ),
    ).toEqual([A, C]);
    expect(tenantsAtGate([A], undefined)).toEqual([]);
  });
});

describe('errorKeyForStatus', () => {
  it.each([
    [400, 'create', 'admin.errors.invalid'],
    [403, 'decision', 'admin.errors.forbidden'],
    [404, 'decision', 'admin.errors.noRun'],
    [404, 'rowAction', 'admin.errors.notFound'],
    [409, 'create', 'admin.errors.codeTaken'],
    [409, 'decision', 'admin.errors.notAtGate'],
    [409, 'rowAction', 'admin.errors.conflict'],
    [503, 'decision', 'admin.errors.stateUnreadable'],
    [500, 'create', 'admin.errors.generic'],
    [undefined, 'create', 'admin.errors.generic'],
  ] as const)('%s during %s → %s', (status, context, key) => {
    expect(errorKeyForStatus(status, context)).toBe(key);
  });
});

describe('initials', () => {
  it.each([
    ['Platform Operator', 'PO'],
    ['somchai', 'SO'],
    ['  ', '?'],
    [null, '?'],
    [undefined, '?'],
  ])('%j → %s', (name, out) => {
    expect(initials(name)).toBe(out);
  });
});

describe('connectionState', () => {
  it('is offline on an error, online on success, and checking before either', () => {
    expect(connectionState({ isError: true, isSuccess: false })).toBe('offline');
    expect(connectionState({ isError: false, isSuccess: true })).toBe('online');
    expect(connectionState({ isError: false, isSuccess: false })).toBe('checking');
  });
});
