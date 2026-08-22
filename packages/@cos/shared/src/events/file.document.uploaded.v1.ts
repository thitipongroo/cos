// Canonical event: file.document.uploaded.v1
// Source: context/00_master_construction_os.md §Phase 9

import type { BaseEventEnvelope } from '@cos/types';

export interface FileDocumentUploadedPayload {
  file_id: string; // UUID
  tenant_id: string; // UUID
  entity_type: string | null;
  entity_id: string | null; // UUID
  mime_type: string;
}

export type FileDocumentUploadedEvent = BaseEventEnvelope<FileDocumentUploadedPayload>;
