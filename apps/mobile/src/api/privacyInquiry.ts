// Privacy-inquiry API (ADR-091) — the pre-auth channel on the Privacy Policy screen.
//
// Called before a session exists, so no auth header, exactly like ./auth.ts. It is the only WRITE in
// this app that reaches the backend without a token of any kind.
//
// The response is deliberately minimal: a reference and a timestamp, and nothing the sender typed.
// The success screen has everything else already, because the sender is the one who entered it.

import { apiClient } from './client';

export const INQUIRY_CATEGORIES = [
  'GENERAL',
  'DATA_ACCESS',
  'DATA_CORRECTION',
  'DATA_DELETION',
  'SECURITY_CONCERN',
] as const;

export type InquiryCategory = (typeof INQUIRY_CATEGORIES)[number];

export interface PrivacyInquiryInput {
  full_name: string;
  email: string;
  phone?: string;
  category?: InquiryCategory;
  subject: string;
  message: string;
}

export interface PrivacyInquiryReceipt {
  reference: string;
  /** ISO-8601 instant the platform recorded it. Rendered through the i18n date formatter. */
  received_at: string;
}

export async function submitPrivacyInquiry(
  input: PrivacyInquiryInput,
): Promise<PrivacyInquiryReceipt> {
  const { data } = await apiClient.post<PrivacyInquiryReceipt>('/privacy/inquiries', input);
  return data;
}
