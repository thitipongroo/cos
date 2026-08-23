// Integration tests: analytics query layer — Phase 14
//
// §35.13 ESC-33. SCOPE, stated plainly: this covers the **ClickHouse → API** half of the analytics
// pipeline. It does NOT cover Kafka → ClickHouse, which needs a live broker plus Schema Registry
// for the AvroConfluent engine tables in 02-kafka-tables.sql. TC-P14-INT-001 therefore stays
// PLANNED; what closes here is the half this repository actually owns — the SQL.
//
// That half is worth testing on its own. AggregatingMergeTree stores PARTIAL aggregate states, so
// every read has to say `FINAL` and `sumMerge`/`countMerge`; get that wrong and the dashboard
// silently reports a fraction of the real number. A mocked ClickHouse client returns whatever the
// test hands it, so it cannot catch that class of error at all. This runs the service's real
// queries against a real ClickHouse loaded with the committed DDL.

import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import * as fs from 'fs';
import * as path from 'path';

import { AnalyticsService } from '../src/modules/analytics/analytics.service';

const TENANT_A = 'aaaaaaaa-0001-4000-8000-000000000001';
const TENANT_B = 'bbbbbbbb-0001-4000-8000-000000000001';
const PROJECT_1 = 'cccccccc-0001-4000-8000-000000000001';
const PROJECT_2 = 'cccccccc-0002-4000-8000-000000000001';

/** A cache that never hits, so every assertion exercises a real ClickHouse round-trip. */
const noCache = {
  get: async () => undefined,
  set: async () => undefined,
} as never;

describe('Analytics query layer (Testcontainers — ClickHouse)', () => {
  let container: StartedTestContainer;
  let ch: ClickHouseClient;
  let service: AnalyticsService;

  beforeAll(async () => {
    container = await new GenericContainer('clickhouse/clickhouse-server:24.8-alpine')
      .withEnvironment({
        CLICKHOUSE_DB: 'analytics',
        CLICKHOUSE_USER: 'cos',
        CLICKHOUSE_PASSWORD: 'cos_test',
        CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: '1',
      })
      .withExposedPorts(8123)
      .withWaitStrategy(Wait.forHttp('/ping', 8123).forStatusCode(200))
      .withStartupTimeout(180_000)
      .start();

    ch = createClient({
      url: `http://${container.getHost()}:${container.getMappedPort(8123)}`,
      username: 'cos',
      password: 'cos_test',
      database: 'analytics',
    });

    // Load the committed DDL — the same files docker-compose mounts into initdb.d. Only the
    // database and the aggregation targets: the Kafka engine tables and the materialized views
    // that feed them need a broker, which this spec deliberately does not start.
    const ddlDir = path.resolve(__dirname, '../../infrastructure/clickhouse/initdb.d');
    for (const file of ['01-database.sql', '03-aggregation-tables.sql']) {
      const sql = fs.readFileSync(path.join(ddlDir, file), 'utf8');
      // Strip whole-line -- comments BEFORE splitting on ';'. The DDL documents each table in a
      // comment block containing semicolons of its own, so a naive split hands ClickHouse a
      // fragment that starts mid-sentence.
      const stripped = sql
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');
      for (const statement of stripped
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean)) {
        await ch.command({ query: statement });
      }
    }

    service = new AnalyticsService(ch, noCache);
  }, 300_000);

  afterAll(async () => {
    await ch?.close();
    await container?.stop();
  });

  /**
   * Inserts a partial aggregate state exactly as a materialized view would — including the
   * cast: the columns are Decimal(19,4), which is Decimal128, so `toDecimal64` (Decimal(18,4))
   * is rejected outright. 04-materialized-views.sql uses toDecimal128 for the same reason.
   */
  async function insertCost(params: {
    tenantId: string;
    projectId: string;
    eventDate: string;
    committed: string;
    actual: string;
    budget: string;
  }): Promise<void> {
    await ch.command({
      query: `
        INSERT INTO analytics.project_cost_daily
        SELECT
          toUUID('${params.tenantId}'),
          toUUID('${params.projectId}'),
          toDate('${params.eventDate}'),
          sumState(toDecimal128(${params.committed}, 4)),
          sumState(toDecimal128(${params.actual}, 4)),
          toDecimal128(${params.budget}, 4)
      `,
    });
  }

  describe('the DDL the repository ships actually applies', () => {
    it('creates the aggregation targets', async () => {
      const result = await ch.query({
        query: `SELECT name FROM system.tables WHERE database = 'analytics' ORDER BY name`,
        format: 'JSONEachRow',
      });
      const names = (await result.json<{ name: string }>()).map((r) => r.name);
      expect(names).toContain('project_cost_daily');
      expect(names).toContain('procurement_activity_daily');
    });

    it('uses AggregatingMergeTree, which is why every read must merge states', async () => {
      const result = await ch.query({
        query: `SELECT engine FROM system.tables WHERE database = 'analytics' AND name = 'project_cost_daily'`,
        format: 'JSONEachRow',
      });
      const [row] = await result.json<{ engine: string }>();
      expect(row!.engine).toBe('AggregatingMergeTree');
    });
  });

  describe('executive dashboard', () => {
    beforeAll(async () => {
      // Two partial states for the same project on different days. A query that forgot sumMerge
      // would report one of them, or a garbled state, instead of the total.
      await insertCost({
        tenantId: TENANT_A,
        projectId: PROJECT_1,
        eventDate: '2026-06-01',
        committed: '400000',
        actual: '300000',
        budget: '1000000',
      });
      await insertCost({
        tenantId: TENANT_A,
        projectId: PROJECT_1,
        eventDate: '2026-06-02',
        committed: '100000',
        actual: '200000',
        budget: '0',
      });
      // A second project, well inside budget.
      await insertCost({
        tenantId: TENANT_A,
        projectId: PROJECT_2,
        eventDate: '2026-06-01',
        committed: '10000',
        actual: '10000',
        budget: '1000000',
      });
      // Same project id under a different tenant — must never leak into tenant A's dashboard.
      await insertCost({
        tenantId: TENANT_B,
        projectId: PROJECT_1,
        eventDate: '2026-06-01',
        committed: '999999',
        actual: '999999',
        budget: '999999',
      });
    });

    it('sums the partial states across days', async () => {
      const rows = await service.getExecutiveDashboard(
        TENANT_A,
        [PROJECT_1],
        '2026-06-01,2026-06-30',
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0]!.totalCommitted)).toBe(500_000);
      expect(Number(rows[0]!.totalActual)).toBe(500_000);
    });

    it('takes the budget snapshot as the max, not the sum', async () => {
      // budget_amount is a non-aggregate snapshot repeated per row; summing it would double it.
      const rows = await service.getExecutiveDashboard(
        TENANT_A,
        [PROJECT_1],
        '2026-06-01,2026-06-30',
      );
      expect(Number(rows[0]!.totalBudget)).toBe(1_000_000);
    });

    it('computes utilisation from actual over budget', async () => {
      const rows = await service.getExecutiveDashboard(
        TENANT_A,
        [PROJECT_1],
        '2026-06-01,2026-06-30',
      );
      expect(rows[0]!.utilizationPct).toBeCloseTo(50, 2);
    });

    it('flags a project as at risk only past the threshold', async () => {
      // |actual − budget| / budget = 50%. A 60% threshold must not flag it; 10% must.
      const lenient = await service.getExecutiveDashboard(
        TENANT_A,
        [PROJECT_1],
        '2026-06-01,2026-06-30',
        60,
      );
      // ESC-34, resolved: atRisk is UInt8 on the wire, and the declared type now says so. Asserted
      // as the exact 0/1 it is — a Boolean() coercion here would pass even if the value silently
      // became a string, which is the failure this case exists to catch.
      expect(lenient[0]!.atRisk).toBe(0);

      const strict = await service.getExecutiveDashboard(
        TENANT_A,
        [PROJECT_1],
        '2026-06-01,2026-06-30',
        10,
      );
      expect(strict[0]!.atRisk).toBe(1);
    });

    it('never returns another tenant’s figures', async () => {
      const rows = await service.getExecutiveDashboard(
        TENANT_A,
        [PROJECT_1],
        '2026-06-01,2026-06-30',
      );
      // Tenant B holds 999,999 against the same project id.
      expect(Number(rows[0]!.totalCommitted)).toBe(500_000);
      expect(Number(rows[0]!.totalCommitted)).not.toBe(999_999);
    });

    it('returns a row per requested project', async () => {
      const rows = await service.getExecutiveDashboard(
        TENANT_A,
        [PROJECT_1, PROJECT_2],
        '2026-06-01,2026-06-30',
      );
      expect(rows.map((r) => r.projectId).sort()).toEqual([PROJECT_1, PROJECT_2].sort());
    });

    it('excludes rows outside the requested date range', async () => {
      const rows = await service.getExecutiveDashboard(
        TENANT_A,
        [PROJECT_1],
        '2026-07-01,2026-07-31',
      );
      expect(rows).toEqual([]);
    });

    it('reports zero utilisation rather than dividing by a zero budget', async () => {
      const projectNoBudget = 'cccccccc-0009-4000-8000-000000000001';
      await insertCost({
        tenantId: TENANT_A,
        projectId: projectNoBudget,
        eventDate: '2026-06-01',
        committed: '5000',
        actual: '5000',
        budget: '0',
      });

      const rows = await service.getExecutiveDashboard(
        TENANT_A,
        [projectNoBudget],
        '2026-06-01,2026-06-30',
      );
      expect(rows[0]!.utilizationPct).toBe(0);
      expect(rows[0]!.atRisk).toBe(0);
    });
  });

  describe('failure behaviour', () => {
    it('surfaces a ClickHouse outage as 503, not as an empty dashboard', async () => {
      // An empty array would read as "no cost recorded"; the endpoint must say it cannot answer.
      const brokenClient = createClient({
        url: 'http://127.0.0.1:1',
        request_timeout: 1_000,
      });
      const broken = new AnalyticsService(brokenClient, noCache);

      await expect(
        broken.getExecutiveDashboard(TENANT_A, [PROJECT_1], '2026-06-01,2026-06-30'),
      ).rejects.toThrow(/ClickHouse unavailable/);

      await brokenClient.close();
    }, 30_000);
  });
});
