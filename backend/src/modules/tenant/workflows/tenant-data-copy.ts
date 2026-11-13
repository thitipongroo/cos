// Copy one tenant's rows from the shared database into its new dedicated one (D46, 2026-11-13).
//
// migrateDataActivity used `pg_dump … --where="tenant_id='…'" | psql …`. pg_dump has no --where (measured on
// PostgreSQL 18.6: "unrecognized option"), so the step could never have run; a schema dump would also have
// re-created the tables `prisma migrate deploy` had just made. This copies rows only, in process, with no
// shell:
//
//   - the tables are every table of TENANT_DATA_SCHEMAS, read from pg_catalog — a table a migration adds
//     is included without editing a list — and each must have a tenant_id column (the copy refuses to run
//     otherwise, rather than skip one silently). Not information_schema: it hides tables the role holds
//     no privilege on, which would drop them from the copy without an error;
//   - both roles must bypass row-level security (superuser or BYPASSRLS): the ten schemas FORCE RLS with
//     policies for app_user only, so any other role would read and write nothing — and both counts below
//     would agree on zero;
//   - the source is read in one REPEATABLE READ, READ ONLY transaction, so every table comes from the same
//     snapshot;
//   - the target is written in one transaction with `session_replication_role = replica`: no foreign-key
//     or trigger firing while loading. Two nullable references point into platform
//     (procurement.rfq_invitations.vendor_identity_id, boq.boq_items.central_price_id), and platform never
//     moves to a dedicated database (get-db-url.ts), so those tables are empty there; replica mode keeps
//     the values, which name rows of the shared catalogs. Parents still go before children (no cycle in
//     the 60 foreign keys between these schemas, measured), so the order reads naturally;
//   - if the target already holds rows of the tenant it never deletes them: routing switches to the
//     dedicated database before this step runs (assignDedicatedDbActivity, then the approval wait), so they
//     can be the tenant's own writes. When every table's count equals the source's, an earlier attempt
//     committed the copy (Temporal retries an attempt that failed or timed out after its commit) and this
//     one reports it done; otherwise it refuses. A failed attempt leaves nothing behind (one transaction);
//   - per table, the target count must equal the source count, or the transaction rolls back;
//   - DateStyle and IntervalStyle are pinned to ISO on both sessions, so text COPY reads back what it wrote
//     whatever the two servers' defaults are.
//
// On an error the target is rolled back and the SOURCE CONNECTION IS CLOSED rather than rolled back: after a
// COPY TO is cut off mid-stream, `ROLLBACK` on that client never returns (measured), which would hang the
// activity and keep a snapshot open on the shared database.
//
// COPY takes no bind parameters, so the tenant id is a literal: the caller asserts it is a UUID, and it is
// escaped as a literal here as well.

import type { Client } from 'pg';
import { from as copyFrom, to as copyTo } from 'pg-copy-streams';
import { pipeline } from 'node:stream/promises';

/** The schemas that move to a dedicated database. `platform` never does (get-db-url.ts). */
export const TENANT_DATA_SCHEMAS = [
  'projects',
  'boq',
  'procurement',
  'finance',
  'files',
  'notifications',
  'site_ops',
  'equipment',
  'workforce',
  'ai',
] as const;

export interface TenantTable {
  schema: string;
  table: string;
  /** Copyable columns in ordinal order (generated columns excluded). */
  columns: string[];
}

export interface ForeignKeyEdge {
  /** `schema.table` holding the foreign key. */
  from: string;
  /** `schema.table` it references. */
  to: string;
}

export interface CopiedTable {
  table: string;
  rows: number;
}

export interface CopyResult {
  /** True when an earlier attempt had already committed exactly these rows; nothing was written. */
  alreadyCopied: boolean;
  tables: CopiedTable[];
}

type Queryable = Pick<Client, 'query'>;

const key = (t: { schema: string; table: string }) => `${t.schema}.${t.table}`;

/** Every base table of the schemas, with its copyable columns; throws if one lacks tenant_id. */
export async function listTenantTables(
  src: Queryable,
  schemas: readonly string[] = TENANT_DATA_SCHEMAS,
): Promise<TenantTable[]> {
  // Ordinary and partitioned tables, not their partitions (a partitioned parent's SELECT and COPY FROM
  // already cover them); generated and dropped columns left out.
  const { rows } = await src.query<{ schema: string; table: string; column: string }>(
    `SELECT n.nspname AS schema, c.relname AS table, a.attname AS column
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE c.relkind IN ('r', 'p')
        AND NOT c.relispartition
        AND n.nspname = ANY($1::text[])
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND a.attgenerated = ''
      ORDER BY n.nspname, c.relname, a.attnum`,
    [schemas],
  );
  const byTable = new Map<string, TenantTable>();
  for (const r of rows) {
    const k = `${r.schema}.${r.table}`;
    if (!byTable.has(k)) byTable.set(k, { schema: r.schema, table: r.table, columns: [] });
    byTable.get(k)!.columns.push(r.column);
  }
  const tables = [...byTable.values()];
  const missing = tables.filter((t) => !t.columns.includes('tenant_id')).map(key);
  if (missing.length > 0) {
    throw new Error(`tables without tenant_id cannot be copied per tenant: ${missing.join(', ')}`);
  }
  return tables;
}

/** Foreign keys between the given tables (self-references and references elsewhere left out). */
export async function listForeignKeys(
  src: Queryable,
  tables: readonly TenantTable[],
): Promise<ForeignKeyEdge[]> {
  const names = new Set(tables.map(key));
  const { rows } = await src.query<ForeignKeyEdge>(
    `SELECT cn.nspname || '.' || cl.relname AS "from", fn.nspname || '.' || fc.relname AS "to"
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_namespace cn ON cn.oid = cl.relnamespace
       JOIN pg_class fc ON fc.oid = c.confrelid
       JOIN pg_namespace fn ON fn.oid = fc.relnamespace
      WHERE c.contype = 'f'`,
  );
  return rows.filter((e) => e.from !== e.to && names.has(e.from) && names.has(e.to));
}

/** Parents before children; stable (alphabetical) among independent tables; throws on a cycle. */
export function orderByForeignKeys(
  tables: readonly TenantTable[],
  edges: readonly ForeignKeyEdge[],
): TenantTable[] {
  const byKey = new Map(tables.map((t) => [key(t), t]));
  const parents = new Map<string, Set<string>>([...byKey.keys()].map((k) => [k, new Set()]));
  for (const e of edges) parents.get(e.from)?.add(e.to);
  const ordered: TenantTable[] = [];
  const done = new Set<string>();
  const remaining = new Set([...byKey.keys()].sort());
  while (remaining.size > 0) {
    const ready = [...remaining].filter((k) => [...parents.get(k)!].every((p) => done.has(p)));
    if (ready.length === 0) {
      throw new Error(`foreign-key cycle among: ${[...remaining].join(', ')}`);
    }
    for (const k of ready) {
      ordered.push(byKey.get(k)!);
      done.add(k);
      remaining.delete(k);
    }
  }
  return ordered;
}

const ident = (c: Pick<Client, 'escapeIdentifier'>, t: TenantTable) =>
  `${c.escapeIdentifier(t.schema)}.${c.escapeIdentifier(t.table)}`;

/** Throws unless the session's role is a superuser or has BYPASSRLS. */
export async function assertBypassesRls(db: Queryable, side: string): Promise<void> {
  const { rows } = await db.query<{ role: string; ok: boolean }>(
    `SELECT current_user AS role, (rolsuper OR rolbypassrls) AS ok FROM pg_roles WHERE rolname = current_user`,
  );
  if (rows[0]?.ok !== true) {
    throw new Error(
      `${side} role ${rows[0]?.role ?? '?'} is subject to row-level security: it would copy nothing`,
    );
  }
}

/** Whether the tenant has a row in any of the tables. */
export async function tenantHasRows(
  db: Queryable & Pick<Client, 'escapeIdentifier'>,
  tenantId: string,
  tables: readonly TenantTable[],
): Promise<boolean> {
  for (const t of tables) {
    const { rows } = await db.query<{ found: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM ${ident(db, t)} WHERE tenant_id = $1) AS found`,
      [tenantId],
    );
    if (rows[0]?.found === true) return true;
  }
  return false;
}

async function countRows(
  db: Queryable & Pick<Client, 'escapeIdentifier'>,
  tenantId: string,
  t: TenantTable,
): Promise<string> {
  const { rows } = await db.query<{ n: string }>(
    `SELECT count(*) AS n FROM ${ident(db, t)} WHERE tenant_id = $1`,
    [tenantId],
  );
  return rows[0]!.n;
}

/**
 * Copy the tenant's rows of every table, parents first, in one target transaction. Returns the row count
 * per table. If the target already has rows of the tenant: done already when every count matches the
 * source, refused otherwise. On any error the target rolls back and the source connection is closed (see
 * the header); the caller must not reuse `src` after a throw.
 */
export async function copyTenantRows(
  src: Client,
  dst: Client,
  tenantId: string,
  tables: readonly TenantTable[],
): Promise<CopyResult> {
  await assertBypassesRls(src, 'source');
  await assertBypassesRls(dst, 'target');
  if (await tenantHasRows(dst, tenantId, tables)) {
    const done: CopiedTable[] = [];
    for (const t of tables) {
      const [s, d] = [await countRows(src, tenantId, t), await countRows(dst, tenantId, t)];
      if (s !== d) {
        throw new Error(
          `the dedicated database already has rows of tenant ${tenantId} that differ from the shared one ` +
            `(${key(t)}: ${d} there, ${s} here): refusing to copy over them`,
        );
      }
      done.push({ table: key(t), rows: Number(s) });
    }
    return { alreadyCopied: true, tables: done };
  }

  const copied: CopiedTable[] = [];
  await src.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await dst.query('BEGIN');
  try {
    for (const db of [src, dst]) {
      await db.query(`SET LOCAL DateStyle = 'ISO, YMD'`);
      await db.query(`SET LOCAL IntervalStyle = 'iso_8601'`);
    }
    await dst.query('SET LOCAL session_replication_role = replica');
    for (const t of tables) {
      const cols = t.columns.map((c) => src.escapeIdentifier(c)).join(', ');
      const where = `tenant_id = ${src.escapeLiteral(tenantId)}`;
      const reader = src.query(
        copyTo(`COPY (SELECT ${cols} FROM ${ident(src, t)} WHERE ${where}) TO STDOUT`),
      );
      const writer = dst.query(copyFrom(`COPY ${ident(dst, t)} (${cols}) FROM STDIN`));
      await pipeline(reader, writer);

      const [s, d] = [await countRows(src, tenantId, t), await countRows(dst, tenantId, t)];
      if (s !== d) throw new Error(`${key(t)}: copied ${d} rows, source has ${s}`);
      copied.push({ table: key(t), rows: Number(s) });
    }
    await dst.query('COMMIT');
    // The copy is committed; the read-only snapshot's end cannot change it. A failure here is left to the
    // caller's cleanup rather than turned into a failed (and retried) copy.
    await src.query('COMMIT').catch(() => undefined);
    return { alreadyCopied: false, tables: copied };
  } catch (err) {
    await dst.query('ROLLBACK').catch(() => undefined);
    await src.end().catch(() => undefined);
    throw err;
  }
}
