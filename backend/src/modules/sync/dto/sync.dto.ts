import { IsString, IsObject, IsOptional, IsIn } from 'class-validator';

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
  server_timestamp: string;
}
