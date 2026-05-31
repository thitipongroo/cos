// Event payload stub — full payload spec in context/00_master_construction_os.md §6
// Implemented in Phase 5 (Procurement Service).
import type { BaseEventEnvelope } from '@cos/types';
export type VendorInvoiceReceivedPayload = Record<string, unknown>;
export type VendorInvoiceReceivedEvent = BaseEventEnvelope<VendorInvoiceReceivedPayload>;
