// useCollection — reactive read of a local table (offline-first source of truth).
// Drizzle useLiveQuery re-runs the SELECT whenever expo-sqlite reports a change to THAT table
// (enableChangeListener on the shared handle in db/database.ts). Signature unchanged from the
// WatermelonDB version, so screens keep calling useCollection<Issue>('local_issues').

import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db, TABLES, TableName } from '../db/database';

export interface CollectionOptions {
  /**
   * Restrict to rows where a column equals a value — pushed into SQL instead of filtered in JS.
   *
   * Column equality is the only shape offered because it is the only shape the screens use (almost
   * always `projectId`). Anything richer belongs in a query written where it is needed, not in a
   * mini-language grown here.
   *
   * An empty-string value means "not chosen yet" throughout this app (no active project), and is
   * treated as no filter — matching what the screens' in-memory `projectId === '' || …` guards did.
   */
  equals?: { column: string; value: string };
  /**
   * Cap on rows returned.
   *
   * WHY A CAP IS WORTH HAVING. This hook used to be `db.select().from(table)` with no `where` and no
   * `limit`, for every caller, against a local database allowed to grow to 500 MB (§17.7). A device
   * a year into a large site pulls the whole of `local_tasks` into JS on every change to it, to draw
   * a list that shows twenty rows.
   *
   * Not defaulted: a silent cap is a silently wrong list. Callers that display a bounded list pass
   * one; callers that aggregate must not.
   */
  limit?: number;
}

export function useCollection<T>(table: TableName, options?: CollectionOptions): T[] {
  const t = TABLES[table];
  const { equals, limit } = options ?? {};

  let query = db.select().from(t).$dynamic();
  if (equals && equals.value !== '') {
    query = query.where(eq(t[equals.column as keyof typeof t] as never, equals.value));
  }
  if (limit !== undefined) {
    query = query.limit(limit);
  }

  // `deps` — the effect inside useLiveQuery re-subscribes only when these change, so the query object
  // being rebuilt each render is fine, and a changed filter/limit correctly re-runs the SELECT.
  const { data } = useLiveQuery(query, [table, equals?.column, equals?.value, limit]);
  return (data ?? []) as T[];
}
