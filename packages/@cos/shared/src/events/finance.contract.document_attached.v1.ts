// finance.contract.document_attached.v1 — Phase 7 Finance Service (ADR-058)
// Emitted when a contract document is attached, whether uploaded or generated in-app.
// Shape mirrors src/avro/finance.contract.document_attached.v1.avsc.
import type { BaseEventEnvelope } from '@cos/types';

export interface ContractDocumentAttachedPayload {
  contract_id: string;
  project_id: string;
  /** File Service file_id — the document every later signature is bound to by hash. */
  document_id: string;
}

export type ContractDocumentAttachedEvent = BaseEventEnvelope<ContractDocumentAttachedPayload>;
