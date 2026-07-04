// useCollection — reactive read of a local table (offline-first source of truth).
// Drizzle useLiveQuery re-runs the SELECT whenever expo-sqlite reports a change
// (enableChangeListener on the shared handle in db/database.ts). Signature unchanged from the
// WatermelonDB version, so screens keep calling useCollection<Issue>('local_issues').

import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db, TABLES, TableName } from '../db/database';

export function useCollection<T>(table: TableName): T[] {
  const { data } = useLiveQuery(db.select().from(TABLES[table]));
  return (data ?? []) as T[];
}
