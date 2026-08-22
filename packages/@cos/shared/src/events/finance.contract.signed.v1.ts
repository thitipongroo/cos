// finance.contract.signed.v1 — Phase 7 Finance Service (ADR-058)
// Emitted once BOTH parties' signatures verify — the bilateral execution of the contract.
// Shape mirrors src/avro/finance.contract.signed.v1.avsc.
import type { BaseEventEnvelope } from '@cos/types';

export interface ContractSignedPayload {
  contract_id: string;
  project_id: string;
}

export type ContractSignedEvent = BaseEventEnvelope<ContractSignedPayload>;
