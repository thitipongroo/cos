// useCollection — reactive read of a local WatermelonDB table.
// Returns the current rows and re-renders on any local change (offline-first source of truth).

import { useEffect, useState } from 'react';
import { Model } from '@nozbe/watermelondb';
import { database } from '../db/database';

export function useCollection<T extends Model>(table: string): T[] {
  const [rows, setRows] = useState<T[]>([]);

  useEffect(() => {
    const subscription = database
      .get<T>(table)
      .query()
      .observe()
      .subscribe((next) => setRows(next));
    return () => subscription.unsubscribe();
  }, [table]);

  return rows;
}
