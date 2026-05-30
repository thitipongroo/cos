export interface CursorPaginationMeta {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
  totalCount?: number;
}

export interface CursorPage<T> {
  data: T[];
  meta: CursorPaginationMeta;
}
