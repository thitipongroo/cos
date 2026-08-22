// Canonical event: file.document.quarantined.v1
// Source: context/00_master_construction_os.md §Phase 9

import type { BaseEventEnvelope } from '@cos/types';

export interface FileDocumentQuarantinedPayload {
  file_id: string; // UUID
  tenant_id: string; // UUID
  threat_type: string | null;
}

export type FileDocumentQuarantinedEvent = BaseEventEnvelope<FileDocumentQuarantinedPayload>;
