'use client';

/**
 * Vendor Portal API client (ADR-030). External vendors are NOT next-auth users, so these hooks do
 * not use `useApi`/`useSession`:
 *   - Tier 1 (magic-link): the invitation token is in the URL path; no Authorization header.
 *   - Tier 2 (session): responding to an RFQ returns a vendor session token + tenant id (stored in
 *     localStorage); subsequent calls send `Bearer <session>` + an `x-vendor-tenant-id` header.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from './client';

export interface VendorRfq {
  rfq_id: string;
  rfq_number: string;
  project_id: string;
  status: string;
  deadline: string;
}

export interface VendorPurchaseOrder {
  po_id: string;
  po_number: string;
  status: string;
  total_amount: string;
  currency_code: string;
  delivery_date: string;
  rfq_id: string | null;
}

export interface VendorInvoice {
  invoice_id: string;
  po_id: string;
  invoice_number: string;
  amount: string;
  currency_code: string;
  invoice_date: string;
  due_date: string;
  status: string;
}

export interface VendorQuotation {
  quotation_id: string;
  rfq_id: string;
  total_amount: string;
  currency_code: string;
  validity_days: number;
  submitted_at: string;
}

export interface VendorInvitedRfq {
  rfq_id: string;
  rfq_number: string;
  status: string;
  deadline: string;
  invitation_status: string;
}

export interface SubmitQuotationInput {
  total_amount: string;
  currency_code: string;
  validity_days: number;
}

export interface SubmitInvoiceInput {
  po_id: string;
  invoice_number: string;
  amount: string;
  currency_code: string;
  invoice_date: string;
  due_date: string;
}

interface QuotationResult {
  quotation: { quotation_id: string };
  vendorSession: string;
  tenantId: string;
}

// ── Tier-2 session storage ────────────────────────────────────────────────────

const SESSION_KEY = 'cos.vendor.session';

export interface VendorSession {
  token: string;
  tenantId: string;
}

export function getVendorSession(): VendorSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  return raw ? (JSON.parse(raw) as VendorSession) : null;
}

function setVendorSession(session: VendorSession): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}

function tier2Fetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = getVendorSession();
  if (!session) {
    throw new ApiError(401, 'No vendor session — respond to an RFQ first');
  }
  const headers = new Headers(init?.headers);
  headers.set('x-vendor-tenant-id', session.tenantId);
  return apiFetch<T>(path, session.token, { ...init, headers });
}

// ── Tier 1: invited RFQ + quotation ──────────────────────────────────────────

export function useVendorRfq(token: string) {
  return useQuery({
    queryKey: ['vendor-rfq', token],
    queryFn: () => apiFetch<VendorRfq>(`/vendor/rfq/${encodeURIComponent(token)}`, undefined),
  });
}

export function useSubmitQuotation(token: string) {
  return useMutation({
    mutationFn: (input: SubmitQuotationInput) =>
      apiFetch<QuotationResult>(`/vendor/rfq/${encodeURIComponent(token)}/quotation`, undefined, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => setVendorSession({ token: data.vendorSession, tenantId: data.tenantId }),
  });
}

// ── Tier 2: PO status + invoices ──────────────────────────────────────────────

export function useVendorPurchaseOrders() {
  return useQuery({
    queryKey: ['vendor-purchase-orders'],
    queryFn: () => tier2Fetch<VendorPurchaseOrder[]>('/vendor/purchase-orders'),
  });
}

export function useVendorInvoices() {
  return useQuery({
    queryKey: ['vendor-invoices'],
    queryFn: () => tier2Fetch<VendorInvoice[]>('/vendor/invoices'),
  });
}

export function useVendorQuotations() {
  return useQuery({
    queryKey: ['vendor-quotations'],
    queryFn: () => tier2Fetch<VendorQuotation[]>('/vendor/quotations'),
  });
}

/** Tier-2: RFQs this vendor was invited to (§20.7.12 → GET /vendor/rfqs). */
export function useVendorInvitedRfqs() {
  return useQuery({
    queryKey: ['vendor-invited-rfqs'],
    queryFn: () => tier2Fetch<VendorInvitedRfq[]>('/vendor/rfqs'),
  });
}

export function useSubmitInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitInvoiceInput) =>
      tier2Fetch<VendorInvoice>('/vendor/invoices', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-invoices'] }),
  });
}
