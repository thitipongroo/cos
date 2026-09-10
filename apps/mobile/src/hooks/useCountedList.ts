// useCountedList — fetch a list once, keep it across a failed refresh, and count it by status.
//
// The lifecycle every CRM list screen has: load on mount, expose a `reload` for pull-to-refresh, and
// count the rows by status for the chip row above them. `leads.tsx`, `opportunities.tsx` and
// `customers.tsx` each wrote it out; the jscpd gate caught the first two on 2026-09-10.
//
// A FAILED FETCH KEEPS THE ROWS IT HAS. Emptying the list on error makes "the server said there are
// none" and "we could not ask" look identical, and only one of those is an answer. This is the
// offline case, which §17 makes the ordinary one for this app rather than the exception — so the
// catch is deliberately silent and the screen goes on showing what it last knew.
//
// THE COUNTS ARE OVER THE WHOLE FETCHED LIST, never the filtered view — see `countByStatus`. A chip
// whose number changed when you pressed it would be reporting its own effect.
//
// What is NOT here is the FILTER, because it is not shared: leads search a company, a contact and a
// source; opportunities search a title; customers search a company. Each screen derives its own
// `visible` from `rows`.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { countByStatus } from '../lib/countByStatus';

export interface CountedList<T> {
  rows: readonly T[];
  loading: boolean;
  /** Row counts by status, plus `ALL`. */
  counts: Readonly<Record<string, number>>;
  /** Re-fetch. Safe to call from a RefreshControl. */
  reload: () => Promise<void>;
  /**
   * Put a just-created row at the head of the list, without a refetch.
   *
   * The capture sheets do this so the row a user has just typed appears the instant the server
   * confirms it. A refetch would work too and would be a second round trip on a connection that
   * §17 assumes is bad — and on a list that carries no server-side ordering guarantee, it could
   * also drop the new row below the fold.
   */
  prepend: (row: T) => void;
}

export function useCountedList<T extends { status: string }>(
  fetcher: () => Promise<T[]>,
): CountedList<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setRows(await fetcher());
    } catch {
      /* offline — the list keeps what it has rather than emptying itself */
    } finally {
      setLoading(false);
    }
    // `fetcher` is deliberately NOT a dependency. Every caller passes a module-level API function,
    // so it is stable; taking it as one would re-fetch on every render for any caller that passed an
    // inline arrow, which is the easy mistake this signature invites.
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const prepend = useCallback((row: T) => {
    setRows((current) => [row, ...current]);
  }, []);

  const counts = useMemo(() => countByStatus(rows), [rows]);

  return { rows, loading, counts, reload, prepend };
}
