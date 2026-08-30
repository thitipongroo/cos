import { IsString, IsObject, IsOptional, IsIn, IsInt, Min } from 'class-validator';

export class PushItemDto {
  @IsString()
  entity_type!: string;

  @IsString()
  entity_id!: string;

  @IsIn(['CREATE', 'UPDATE'])
  operation!: 'CREATE' | 'UPDATE';

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  client_submitted_at?: string;
}

export type ServerSyncStatus = 'ACCEPTED' | 'CONFLICT_FLAGGED' | 'CONFLICT_REJECTED';

export interface PushResponse {
  status: ServerSyncStatus;
  server_payload?: unknown;
}

export interface DeltaResponse {
  updated: Record<string, unknown>[];
  deleted: string[];
  /**
   * The value the client should send as `since` on its next call.
   *
   * When nothing was truncated this is "now". When a page was cut short it is the watermark of the
   * truncated data instead, so the next call resumes from there rather than skipping the remainder.
   */
  server_timestamp: string;
  /** True when at least one entity type had more rows than fit in this page — call again. */
  has_more: boolean;
  /**
   * True when `since` predates the tombstone retention window, so the deletion list in this response
   * is NOT complete: anything deleted and then pruned while the client was away is absent from
   * `deleted` and would otherwise survive on the device forever.
   *
   * The client must drop its local copies of these entity types before applying the pages, then keep
   * paging until `has_more` is false. `updated` is still populated — this flag qualifies the
   * response, it does not replace it (see the note in SyncService.delta).
   */
  full_resync_required: boolean;
  /** Retention window in days, sent only alongside `full_resync_required` so clients can log why. */
  retention_days?: number;
}

/**
 * A queued mutation a device has stopped retrying (spec §17.2).
 *
 * Reported by the device after five failed attempts. The record still exists on the phone — §17.2
 * requires it kept "until synced or admin-resolved" — so this is a report of a delivery failure,
 * not a substitute for the record.
 */
export class ReportExhaustedDto {
  @IsString()
  entity_type!: string;

  @IsString()
  entity_id!: string;

  @IsIn(['CREATE', 'UPDATE'])
  operation!: 'CREATE' | 'UPDATE';

  /** Device-generated id the mutation carried; unique per tenant, so a re-report is idempotent. */
  @IsString()
  client_id!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  retry_count?: number;
}
