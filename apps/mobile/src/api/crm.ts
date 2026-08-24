// CRM API (mobile) — Lead → Opportunity → Customer (§11.3, §14; ADR-029).
//
// Scope is §20.7.10 exactly: leads (list/create), opportunities (list/create-from-lead/convert) and
// a read-only customer list. Contacts (`crm/contacts`) exist on the backend but are NOT in §20.7.10's
// page set, so they are deliberately absent here rather than added speculatively.
//
// Every endpoint below is role-gated server-side: reads to EXECUTIVE / CRM_SALES_MANAGER /
// TENANT_ADMIN, writes to CRM_SALES_MANAGER / TENANT_ADMIN (crm.controller.ts). The mobile tabs are
// shown to CRM_SALES_MANAGER only, so the client never has to second-guess the guard.
//
// Online-only, unlike procurement.ts: those writes use mutate() because a material shortage is
// noticed exactly where there is no signal. CRM work is done from an office or a car, and a queued
// "convert" that replays hours later against an opportunity someone else already converted would
// surface as a stale COS-CRM-003 the user cannot act on. post()/get() fail fast instead.

import { get, post, patch } from './client';

/** crm.leads — mirrors LeadRow in backend/src/modules/crm/crm.repository.ts. */
export interface Lead {
  lead_id: string;
  contact_name: string | null;
  company: string | null;
  status: 'NEW' | 'QUALIFIED' | 'DISQUALIFIED';
  source: string | null;
  assigned_to: string | null;
  created_at: string;
}

/** crm.opportunities — `value` is a DECIMAL string, never a JS number (precision, §14). */
export interface Opportunity {
  opportunity_id: string;
  lead_id: string;
  title: string;
  value: string | null;
  status: 'OPEN' | 'WON' | 'LOST';
  expected_close_date: string | null;
  assigned_to: string | null;
  created_at: string;
}

/** finance.customers — the canonical customer store (ADR-024/029), not a CRM-local copy. */
export interface Customer {
  customer_id: string;
  opportunity_id: string | null;
  company_name: string;
  customer_type: string | null;
  status: string;
  created_at: string;
}

export async function listLeads(status?: string): Promise<Lead[]> {
  return get<Lead[]>('/crm/leads', status ? { status } : undefined);
}

/**
 * Create a lead. Every field is optional server-side (CreateLeadDto), so an empty-ish lead is a
 * legitimate "someone called, get the name down now" capture — the screen enforces its own minimum
 * rather than this client inventing one.
 */
export async function createLead(params: {
  contact_name?: string;
  company?: string;
  source?: string;
}): Promise<Lead> {
  return post<Lead>('/crm/leads', params);
}

export async function listOpportunities(status?: string): Promise<Opportunity[]> {
  return get<Opportunity[]>('/crm/opportunities', status ? { status } : undefined);
}

/** Create an opportunity from a lead — this is what qualifies the lead (crm.service.ts). */
export async function createOpportunity(params: {
  lead_id: string;
  title: string;
  value?: string;
  expected_close_date?: string;
}): Promise<Opportunity> {
  return post<Opportunity>('/crm/opportunities', params);
}

/**
 * Convert a won opportunity into a customer.
 *
 * The server sets the opportunity to WON and inserts into finance.customers in one call, taking the
 * company name from the originating lead and falling back to the opportunity title. Converting twice
 * is rejected with COS-CRM-003, so the caller must treat a WON opportunity as terminal.
 */
export async function convertOpportunity(opportunityId: string): Promise<Customer> {
  return patch<Customer>(`/crm/opportunities/${opportunityId}/convert`, {});
}

export async function listCustomers(): Promise<Customer[]> {
  return get<Customer[]>('/crm/customers');
}
