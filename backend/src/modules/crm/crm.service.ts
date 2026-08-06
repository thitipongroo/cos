// CRM Service — Lead → Opportunity → Customer (ADR-029)
// Creating an opportunity qualifies its lead; convert wins the opportunity and creates a
// finance.customers row (the canonical Customer store, ADR-024).

import {
  Injectable,
  Scope,
  Inject,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { createLogger } from '@cos/logger';
import { clsUserId } from '../../shared/context/cls-context';
import { CrmRepository } from './crm.repository';
import type { LeadRow, OpportunityRow, ContactRow, CrmCustomerRow } from './crm.repository';
import type { CreateLeadDto, CreateOpportunityDto, CreateContactDto } from './dto/crm.dto';

const logger = createLogger('crm-service');

@Injectable({ scope: Scope.REQUEST })
export class CrmService {
  // Resolve user_id lazily via req.userId (TenantContextInterceptor) with a CLS fallback: under
  // @nestjs/platform-fastify req.userId does not reliably reach a Scope.REQUEST provider's injected
  // REQUEST, so fall back to CLS (set by JwtAuthGuard). The old `user.user_id` was always undefined
  // here → '' written into uuid columns → Postgres 22P02. (Matches workforce.)
  private get userId(): string {
    return (this.request as { userId?: string }).userId || clsUserId();
  }

  constructor(
    private readonly repo: CrmRepository,
    @Inject(REQUEST) private readonly request: unknown,
  ) {}

  // ── Leads ───────────────────────────────────────────────────────────────────

  async createLead(dto: CreateLeadDto): Promise<LeadRow> {
    return this.repo.createLead({
      contact_name: dto.contact_name ?? null,
      company: dto.company ?? null,
      source: dto.source ?? null,
      assigned_to: dto.assigned_to ?? null,
      created_by: this.userId,
    });
  }

  async listLeads(status?: string): Promise<LeadRow[]> {
    return this.repo.listLeads(status);
  }

  // ── Opportunities ─────────────────────────────────────────────────────────

  async createOpportunity(dto: CreateOpportunityDto): Promise<OpportunityRow> {
    const lead = await this.repo.findLeadById(dto.lead_id);
    if (!lead) {
      throw new NotFoundException({ error: { code: 'COS-CRM-001', message: 'Lead not found' } });
    }
    const opportunity = await this.repo.createOpportunity({
      lead_id: dto.lead_id,
      title: dto.title,
      value: dto.value ?? null,
      expected_close_date: dto.expected_close_date ?? null,
      assigned_to: dto.assigned_to ?? null,
      created_by: this.userId,
    });
    await this.repo.setLeadStatus(dto.lead_id, 'QUALIFIED'); // §11.3 qualify
    logger.info(
      { opportunity_id: opportunity.opportunity_id, lead_id: dto.lead_id },
      'opp.created',
    );
    return opportunity;
  }

  async listOpportunities(status?: string): Promise<OpportunityRow[]> {
    return this.repo.listOpportunities(status);
  }

  /** Win an opportunity and create the Customer (finance.customers). */
  async convertOpportunity(opportunityId: string): Promise<CrmCustomerRow> {
    const opportunity = await this.repo.findOpportunityById(opportunityId);
    if (!opportunity) {
      throw new NotFoundException({
        error: { code: 'COS-CRM-002', message: 'Opportunity not found' },
      });
    }
    if (opportunity.status === 'WON') {
      throw new UnprocessableEntityException({
        error: {
          code: 'COS-CRM-003',
          message: 'Opportunity already converted',
        },
      });
    }
    const lead = await this.repo.findLeadById(opportunity.lead_id);
    const company_name = lead?.company ?? opportunity.title;

    await this.repo.setOpportunityStatus(opportunityId, 'WON');
    const customer = await this.repo.createCustomerFromOpportunity({
      opportunity_id: opportunityId,
      company_name,
    });
    logger.info(
      { opportunity_id: opportunityId, customer_id: customer.customer_id },
      'opp.converted',
    );
    return customer;
  }

  // ── Contacts ────────────────────────────────────────────────────────────────

  async createContact(dto: CreateContactDto): Promise<ContactRow> {
    const lead = await this.repo.findLeadById(dto.lead_id);
    if (!lead) {
      throw new NotFoundException({ error: { code: 'COS-CRM-001', message: 'Lead not found' } });
    }
    return this.repo.createContact({
      lead_id: dto.lead_id,
      name: dto.name,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      role: dto.role ?? null,
      created_by: this.userId,
    });
  }

  async listContacts(leadId?: string): Promise<ContactRow[]> {
    return this.repo.listContacts(leadId);
  }

  // ── Customers ───────────────────────────────────────────────────────────────

  async listCustomers(): Promise<CrmCustomerRow[]> {
    return this.repo.listCustomers();
  }
}
