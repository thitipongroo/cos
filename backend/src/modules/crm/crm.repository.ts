// CRM Repository — Lead → Opportunity → Customer (ADR-029)
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).
// Customer is the canonical finance.customers store (ADR-024); convert writes there.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';

export interface LeadRow {
  lead_id: string;
  tenant_id: string;
  contact_name: string | null;
  company: string | null;
  status: 'NEW' | 'QUALIFIED' | 'DISQUALIFIED';
  source: string | null;
  assigned_to: string | null;
  created_at: Date;
}

export interface OpportunityRow {
  opportunity_id: string;
  tenant_id: string;
  lead_id: string;
  title: string;
  value: string | null;
  status: 'OPEN' | 'WON' | 'LOST';
  expected_close_date: Date | null;
  assigned_to: string | null;
  created_at: Date;
}

export interface ContactRow {
  contact_id: string;
  tenant_id: string;
  lead_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  created_at: Date;
}

export interface CrmCustomerRow {
  customer_id: string;
  tenant_id: string;
  opportunity_id: string | null;
  company_name: string;
  customer_type: string | null;
  status: string;
  created_at: Date;
}

@Injectable({ scope: Scope.REQUEST })
export class CrmRepository {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }

  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) private readonly request: { tenantId?: string },
  ) {}

  // ── Leads ───────────────────────────────────────────────────────────────────

  async createLead(params: {
    contact_name?: string | null;
    company?: string | null;
    source?: string | null;
    assigned_to?: string | null;
    created_by: string;
  }): Promise<LeadRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<LeadRow[]>`
        INSERT INTO crm.leads (tenant_id, contact_name, company, source, assigned_to, created_by)
        VALUES (${this.tenantId}::uuid, ${params.contact_name ?? null}, ${params.company ?? null},
                ${params.source ?? null}, ${params.assigned_to ?? null}::uuid, ${params.created_by}::uuid)
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async listLeads(status?: string): Promise<LeadRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<LeadRow[]>`
        SELECT * FROM crm.leads
        WHERE tenant_id = ${this.tenantId}::uuid AND deleted_at IS NULL
          AND (${status ?? null}::text IS NULL OR status = ${status ?? null}::text)
        ORDER BY created_at DESC
      `,
    );
  }

  async findLeadById(leadId: string): Promise<LeadRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<LeadRow[]>`
        SELECT * FROM crm.leads
        WHERE lead_id = ${leadId}::uuid AND tenant_id = ${this.tenantId}::uuid AND deleted_at IS NULL
      `,
    );
    return rows[0] ?? null;
  }

  async setLeadStatus(leadId: string, status: string): Promise<void> {
    await this.db.run(
      (tx) =>
        tx.$executeRaw`
        UPDATE crm.leads SET status = ${status}, updated_at = now()
        WHERE lead_id = ${leadId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
  }

  // ── Opportunities ─────────────────────────────────────────────────────────

  async createOpportunity(params: {
    lead_id: string;
    title: string;
    value?: string | null;
    expected_close_date?: string | null;
    assigned_to?: string | null;
    created_by: string;
  }): Promise<OpportunityRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<OpportunityRow[]>`
        INSERT INTO crm.opportunities
          (tenant_id, lead_id, title, value, expected_close_date, assigned_to, created_by)
        VALUES
          (${this.tenantId}::uuid, ${params.lead_id}::uuid, ${params.title},
           ${params.value ?? null}::decimal, ${params.expected_close_date ?? null}::date,
           ${params.assigned_to ?? null}::uuid, ${params.created_by}::uuid)
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async listOpportunities(status?: string): Promise<OpportunityRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<OpportunityRow[]>`
        SELECT * FROM crm.opportunities
        WHERE tenant_id = ${this.tenantId}::uuid AND deleted_at IS NULL
          AND (${status ?? null}::text IS NULL OR status = ${status ?? null}::text)
        ORDER BY created_at DESC
      `,
    );
  }

  async findOpportunityById(opportunityId: string): Promise<OpportunityRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<OpportunityRow[]>`
        SELECT * FROM crm.opportunities
        WHERE opportunity_id = ${opportunityId}::uuid AND tenant_id = ${this.tenantId}::uuid
          AND deleted_at IS NULL
      `,
    );
    return rows[0] ?? null;
  }

  async setOpportunityStatus(opportunityId: string, status: string): Promise<void> {
    await this.db.run(
      (tx) =>
        tx.$executeRaw`
        UPDATE crm.opportunities SET status = ${status}, updated_at = now()
        WHERE opportunity_id = ${opportunityId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
  }

  // ── Contacts ────────────────────────────────────────────────────────────────

  async createContact(params: {
    lead_id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    created_by: string;
  }): Promise<ContactRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ContactRow[]>`
        INSERT INTO crm.contacts (tenant_id, lead_id, name, email, phone, role, created_by)
        VALUES (${this.tenantId}::uuid, ${params.lead_id}::uuid, ${params.name},
                ${params.email ?? null}, ${params.phone ?? null}, ${params.role ?? null},
                ${params.created_by}::uuid)
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async listContacts(leadId?: string): Promise<ContactRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<ContactRow[]>`
        SELECT * FROM crm.contacts
        WHERE tenant_id = ${this.tenantId}::uuid AND deleted_at IS NULL
          AND (${leadId ?? null}::uuid IS NULL OR lead_id = ${leadId ?? null}::uuid)
        ORDER BY created_at DESC
      `,
    );
  }

  // ── Customers (finance.customers — the canonical store, ADR-024/029) ─────────

  /** Convert: create a customer from a won opportunity. */
  async createCustomerFromOpportunity(params: {
    opportunity_id: string;
    company_name: string;
  }): Promise<CrmCustomerRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<CrmCustomerRow[]>`
        INSERT INTO finance.customers (tenant_id, opportunity_id, company_name, status)
        VALUES (${this.tenantId}::uuid, ${params.opportunity_id}::uuid, ${params.company_name}, 'ACTIVE')
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async listCustomers(): Promise<CrmCustomerRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<CrmCustomerRow[]>`
        SELECT * FROM finance.customers
        WHERE tenant_id = ${this.tenantId}::uuid
        ORDER BY created_at DESC
      `,
    );
  }
}
