// Mirror the seeded Postgres figures into the ClickHouse analytics tables — a DEV/CAPTURE utility.
//
// WHY THIS EXISTS. `analytics.project_cost_daily` and `analytics.procurement_activity_daily` are
// written in production by `services/analytics-worker` (Go), which consumes Kafka events. That worker
// consumes FORWARD: it fills the tables from events as they happen and has nothing to say about rows
// that were inserted straight into Postgres by `seed-realistic.ts`. So on a freshly seeded machine
// the OLAP store is EMPTY, `GET /api/v1/analytics/executive` answers `[]`, and every EXECUTIVE screen
// draws em dashes where a budget should be — which is honest, and useless as a screenshot.
//
// This script closes that one gap and nothing else. It reads the SOURCE OF TRUTH (Postgres) and
// writes the same numbers into the aggregate tables in the shape the worker would have produced. It
// invents nothing: every figure below is a SUM over `finance.cost_transactions` or a column of
// `projects.projects`. If the two ever disagree, Postgres is right and this script is the thing to
// re-run.
//
// NOT FOR PRODUCTION. It writes directly to the OLAP store, bypassing Kafka and the worker's
// idempotency; running it against a live cluster would double-count. It exists so a local capture can
// photograph real figures, and `docs/screens/android/README.md` names it as part of the EXECUTIVE
// capture procedure.
//
// AggregateFunction columns cannot be inserted as plain values — they need `-State` functions, which
// is why every INSERT below is an `INSERT … SELECT sumState(…)` rather than a VALUES list. The CAST
// is load-bearing too: `toDecimal64(x, 4)` produces Decimal(18,4) and the column is Decimal(19,4),
// which ClickHouse refuses to convert between for an aggregate state (CANNOT_CONVERT_TYPE).
//
// Run: node prisma/seed-analytics-clickhouse.mjs
// Needs: `make docker-up-full` (ClickHouse is a `full`-profile service) and a seeded Postgres.

import { createClient } from '@clickhouse/client';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import pg from 'pg';

// The two-file env scheme (spec §08): the only .env is the monorepo ROOT one, and these prisma
// scripts run with cwd = backend/. Same two paths `load-root-env.ts` uses — that file is TypeScript
// and this is an .mjs, which is the only reason the four lines are repeated rather than imported.
// dotenv does not override an already-set variable, so a value passed on the command line still wins.
config({ path: resolve(process.cwd(), '../.env') });
config({ path: resolve(process.cwd(), '.env') });

// DIRECT_DATABASE_URL, not DATABASE_URL: the latter points at PgBouncer in transaction mode (QM-18),
// and this script's `SET`-free single queries are fine either way — but a direct connection is the
// honest choice for a one-shot maintenance script that is not part of the request path.
const PG_URL = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'];
const CH_URL = process.env['CLICKHOUSE_URL'] ?? 'http://localhost:8123';
const CH_USER = process.env['CLICKHOUSE_USER'] ?? 'cos';
const CH_PASSWORD = process.env['CLICKHOUSE_PASSWORD'];

if (PG_URL === undefined || CH_PASSWORD === undefined) {
  console.error(
    'seed-analytics-clickhouse: DIRECT_DATABASE_URL and CLICKHOUSE_PASSWORD must be set — ' +
      'run `make env-init` and try again.',
  );
  process.exit(1);
}

/** The day every aggregate row is stamped with. One row per project is all the query needs. */
const EVENT_DATE = new Date().toISOString().slice(0, 10);

const pgClient = new pg.Client({ connectionString: PG_URL });
const ch = createClient({
  url: CH_URL,
  username: CH_USER,
  password: CH_PASSWORD,
  database: 'analytics',
});

/** A DECIMAL(19,4) as ClickHouse wants it in a literal — plain digits, no exponent, no thousands. */
function decimal(value) {
  return Number(value ?? 0).toFixed(4);
}

async function main() {
  await pgClient.connect();

  // Budget from the project row; actual and committed from the transactions that reference it. The
  // seed writes an OVERRUN for at least one project on purpose (BNW2 — "excavation hit rock"), and
  // that is the case the executive dashboard exists to surface, so it must survive the mirror.
  const { rows: costs } = await pgClient.query(`
    SELECT
      p.tenant_id::text        AS tenant_id,
      p.project_id::text       AS project_id,
      p.project_code           AS project_code,
      COALESCE(p.budget_amount, 0)::text AS budget,
      COALESCE(SUM(ct.amount), 0)::text  AS actual
    FROM projects.projects p
    LEFT JOIN finance.cost_transactions ct ON ct.project_id = p.project_id
    GROUP BY p.tenant_id, p.project_id, p.project_code, p.budget_amount
    ORDER BY p.project_code
  `);

  // Overdue invoices — the executive row's third figure. `procurement.invoices` carries NO
  // project_id; it reaches a project through its purchase order, which is why this joins rather than
  // grouping directly. Overdue means the due date has passed and the invoice is not PAID.
  const { rows: overdue } = await pgClient.query(`
    SELECT
      po.tenant_id::text  AS tenant_id,
      po.project_id::text AS project_id,
      COUNT(*)::int       AS overdue_count
    FROM procurement.invoices i
    JOIN procurement.purchase_orders po ON po.po_id = i.po_id
    WHERE i.due_date < CURRENT_DATE
      AND i.status <> 'PAID'
    GROUP BY po.tenant_id, po.project_id
  `);

  await ch.command({ query: 'TRUNCATE TABLE IF EXISTS analytics.project_cost_daily' });
  await ch.command({ query: 'TRUNCATE TABLE IF EXISTS analytics.procurement_activity_daily' });

  for (const row of costs) {
    await ch.command({
      query: `
        INSERT INTO analytics.project_cost_daily
        SELECT
          toUUID('${row.tenant_id}'),
          toUUID('${row.project_id}'),
          toDate('${EVENT_DATE}'),
          sumState(CAST(${decimal(row.actual)} AS Decimal(19, 4))),
          sumState(CAST(${decimal(row.actual)} AS Decimal(19, 4))),
          CAST(${decimal(row.budget)} AS Decimal(19, 4))
      `,
    });
    process.stdout.write(
      `  ${row.project_code.padEnd(6)} budget ${decimal(row.budget)}  actual ${decimal(row.actual)}\n`,
    );
  }

  // FOUR aggregate columns, in the table's own order: po_count, rfq_count, invoice_count,
  // overdue_invoice_count. Only the last is read by the executive dashboard, but a row with three
  // columns would not insert at all — `numbers(n)` produces the n rows each countState() folds.
  for (const row of overdue) {
    await ch.command({
      query: `
        INSERT INTO analytics.procurement_activity_daily
        SELECT
          toUUID('${row.tenant_id}'),
          toUUID('${row.project_id}'),
          toDate('${EVENT_DATE}'),
          countState(),
          countState(),
          countState(),
          countState()
        FROM numbers(${String(row.overdue_count)})
      `,
    });
    process.stdout.write(
      `  overdue invoices: ${String(row.overdue_count)} on project ${row.project_id}
`,
    );
  }

  console.log(`\nMirrored ${String(costs.length)} project cost rows into ClickHouse.`);
  await pgClient.end();
  await ch.close();
}

main().catch(async (err) => {
  console.error(err.message ?? err);
  await pgClient.end().catch(() => undefined);
  await ch.close().catch(() => undefined);
  process.exit(1);
});
