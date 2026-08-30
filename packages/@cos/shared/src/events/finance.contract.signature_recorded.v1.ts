// finance.contract.signature_recorded.v1 — Phase 7 Finance Service (ADR-058)
// Emitted per signature, for either party. The contract itself becomes SIGNED only once BOTH an
// INTERNAL and a CLIENT signature have verified — that transition is finance.contract.signed.v1.
// Shape mirrors src/avro/finance.contract.signature_recorded.v1.avsc.
import type { BaseEventEnvelope } from '@cos/types';

export interface ContractSignatureRecordedPayload {
  contract_id: string;
  signature_id: string;
  /** finance."SignerParty" — INTERNAL | CLIENT. */
  signer_party: string;
  /** finance."SignatureVerificationStatus" — VERIFIED | PENDING | FAILED. */
  verification_status: string;
}

export type ContractSignatureRecordedEvent = BaseEventEnvelope<ContractSignatureRecordedPayload>;
