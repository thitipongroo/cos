'use client';

import { useT } from '../../i18n';
import { LoadingState } from './LoadingState';

/**
 * Generic data-table for list views (§20.6.2 — web list views use data tables;
 * the mobile no-tables rule does not apply to web). Column headers are i18n
 * keys; cells render via an accessor so callers control formatting.
 */
export interface Column<T> {
  /** i18n key for the column header. */
  headerKey: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  emptyKey?: string;
}

export function DataTable<T>({ columns, rows, rowKey, isLoading, emptyKey }: DataTableProps<T>) {
  const t = useT();

  if (isLoading) {
    // The §32.7 loading component, shaped to this table's own column count, instead of the bare
    // "Loading…" line this rendered before (ADR-055; desktop mockup Variant B). `label` is passed
    // for the screen reader — the `table` variant has no caption slot, so it renders only as the
    // progressbar's accessible name; a loading state with nothing to announce is aria-hidden.
    return <LoadingState variant="table" columns={columns.length} label={t('common.loading')} />;
  }
  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-400">
        {t(emptyKey ?? 'common.loading')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.headerKey}
                scope="col"
                className={`px-4 py-2 text-left font-medium text-gray-500 ${col.className ?? ''}`}
              >
                {t(col.headerKey)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-gray-50">
              {columns.map((col) => (
                <td
                  key={col.headerKey}
                  className={`px-4 py-2 text-gray-700 ${col.className ?? ''}`}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
