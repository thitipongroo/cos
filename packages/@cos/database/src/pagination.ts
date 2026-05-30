import { CursorPage, CursorPaginationMeta } from '@cos/types';

export interface CursorPaginationOptions {
  cursor?: string;
  take?: number;
}

export function buildCursorPage<T extends { id: string }>(
  items: T[],
  options: CursorPaginationOptions,
  totalCount?: number,
): CursorPage<T> {
  const take = options.take ?? 20;
  const hasNextPage = items.length > take;
  const data = hasNextPage ? items.slice(0, take) : items;

  const meta: CursorPaginationMeta = {
    hasNextPage,
    hasPreviousPage: !!options.cursor,
    startCursor: data[0]?.id ?? null,
    endCursor: data[data.length - 1]?.id ?? null,
    totalCount,
  };

  return { data, meta };
}
