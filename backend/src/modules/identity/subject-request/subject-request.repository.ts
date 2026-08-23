// Subject-request repository — the tenant's handling of a request from someone with NO account.
//
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008/031),
// so every statement below is additionally bounded by RLS. The explicit `tenant_id = …` predicates
// are the secondary defence QM-4 asks for, not the primary one.
//
// WHY RAW SQL FOR THE MATCHES. `platform.subject_requests` is a Prisma model, but the tables it
// searches are not: `datasource.schemas = ["platform", "files"]`, so `crm.*` and `procurement.*` are
// raw-SQL migrations and unreachable through the Prisma client. Every name is schema-qualified, which
// QM-4 requires anyway across the multi-schema tenant model.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';
import { clsTenantId } from '../../../shared/context/cls-context';
import { applyCap, capLimit } from '../../../shared/pagination/list-cap';

export interface SubjectRequestRow {
  request_id: string;
  tenant_id: string;
  request_type: 'ACCESS' | 'ERASURE';
  subject_email: string | null;
  subject_phone: string | null;
  status: 'OPEN' | 'FULFILLED' | 'REJECTED';
  received_at: Date;
  opened_by: string;
  opened_at: Date;
  closed_at: Date | null;
  outcome_note: string | null;
  verification_token_hash: string | null;
  verification_sent_to: string | null;
  verification_sent_at: Date | null;
  verified_at: Date | null;
  verification_method: string | null;
}

/**
 * One record the tenant holds about the subject.
 *
 * `source` names the table so the operator can tell a CRM contact from a vendor contact person
 * without the shapes being merged into one anonymous blob. `fields` carries only the columns tagged
 * `@pdpa` on that table plus the row's own id — never the whole row: the rest is the tenant's
 * business data (a lead's company, a vendor's purchase history) and is not the subject's to receive.
 */
export interface SubjectMatch {
  source:
    'crm.contacts' | 'crm.leads' | 'procurement.vendors' | 'workforce.workers' | 'platform.users';
  id: string;
  fields: Record<string, string | null>;
}

/**
 * What an erasure actually touched — the ids, per table, not just how many.
 *
 * Counts were enough while the audit trail said "this request erased n rows". Since 2026-08-23 it
 * says WHICH rows (§11.4, TDD OQ-48), and an auditor asking "was this person's worker record erased?"
 * needs an answer the trail can give. Ids are not personal data; the erased values are, and are never
 * carried here.
 */
export interface AnonymisationResult {
  contacts: string[];
  leads: string[];
  vendors: string[];
  workers: string[];
  /**
   * Account rows, with the Keycloak id each one is bound to. The pair travels together because
   * erasing the database row without erasing the Keycloak account leaves the person named and able to
   * log in — the two halves are one operation.
   */
  users: Array<{ userId: string; keycloakUserId: string }>;
}

/** Table names as they appear in `audit_logs.resource_type` for a per-entity erasure record. */
export type ErasedResourceType =
  'crm.contacts' | 'crm.leads' | 'procurement.vendors' | 'workforce.workers' | 'platform.users';

@Injectable({ scope: Scope.REQUEST })
export class SubjectRequestRepository {
  // CLS fallback is load-bearing under Fastify — the REQUEST injected into a Scope.REQUEST provider
  // is not guaranteed to be the object the auth layer decorated (ADR-031).
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? clsTenantId();
  }

  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) private readonly request: { tenantId?: string },
  ) {}

  // ── The request record ──────────────────────────────────────────────────────

  async create(params: {
    request_type: 'ACCESS' | 'ERASURE';
    subject_email: string | null;
    subject_phone: string | null;
    received_at: Date;
    opened_by: string;
    note: string | null;
  }): Promise<SubjectRequestRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<SubjectRequestRow[]>`
        INSERT INTO platform.subject_requests
          (tenant_id, request_type, subject_email, subject_phone, received_at, opened_by, outcome_note)
        VALUES (
          ${this.tenantId}::uuid,
          ${params.request_type}::platform."SubjectRequestType",
          ${params.subject_email},
          ${params.subject_phone},
          ${params.received_at}::timestamptz,
          ${params.opened_by}::uuid,
          ${params.note}
        )
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  /**
   * The tenant's queue, oldest-received first — the order the 30-day deadline is counted in.
   *
   * Capped. This table only ever grows: a subject request is compliance evidence, so CLOSED rows are
   * kept, and the unfiltered call (the default the admin screen makes) therefore returned the tenant's
   * entire PDPA history in one array. Oldest-first is what makes the cap safe to apply: the rows that
   * survive truncation are the ones nearest their statutory deadline, which is what this queue exists
   * to surface. `?status=OPEN` narrows it further and is the query that actually matters operationally.
   */
  async list(status?: string): Promise<SubjectRequestRow[]> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<SubjectRequestRow[]>`
        SELECT * FROM platform.subject_requests
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${status ?? null}::text IS NULL
               OR status = (${status ?? null})::platform."SubjectRequestStatus")
        ORDER BY received_at ASC
        LIMIT ${capLimit()}
      `,
    );
    return applyCap(rows, 'identity.subject_requests');
  }

  async findById(requestId: string): Promise<SubjectRequestRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<SubjectRequestRow[]>`
        SELECT * FROM platform.subject_requests
        WHERE request_id = ${requestId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async close(
    requestId: string,
    status: 'FULFILLED' | 'REJECTED',
    outcomeNote: string,
  ): Promise<SubjectRequestRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<SubjectRequestRow[]>`
        UPDATE platform.subject_requests
           SET status = ${status}::platform."SubjectRequestStatus",
               closed_at = now(),
               outcome_note = ${outcomeNote}
         WHERE request_id = ${requestId}::uuid
           AND tenant_id = ${this.tenantId}::uuid
           AND status = 'OPEN'::platform."SubjectRequestStatus"
        RETURNING *
      `,
    );
    return rows[0] ?? null;
  }

  // ── The search ──────────────────────────────────────────────────────────────

  /**
   * Everything the tenant holds about one person, across the three tagged tables.
   *
   * Matching is on the identifiers the subject gave, and ONLY those: an email matches an email
   * column, a phone a phone column. Matching on name was considered and rejected — names are not
   * unique, and a name search would return other people's records under one person's request.
   *
   * `crm.leads` has no email or phone of its own (only `contact_name`), so it is reached through the
   * contacts that belong to it. A lead with no contact row cannot be matched by an identifier at all,
   * and the service says so rather than reporting a clean "no records".
   */
  async findMatches(email: string | null, phone: string | null): Promise<SubjectMatch[]> {
    const contacts = await this.db.run(
      (tx) =>
        tx.$queryRaw<
          { contact_id: string; name: string; email: string | null; phone: string | null }[]
        >`
        SELECT contact_id, name, email, phone
          FROM crm.contacts
         WHERE tenant_id = ${this.tenantId}::uuid
           AND deleted_at IS NULL
           AND ((${email}::text IS NOT NULL AND lower(email) = lower(${email}::text))
             OR (${phone}::text IS NOT NULL AND phone = ${phone}::text))
      `,
    );

    const leads = await this.db.run(
      (tx) =>
        tx.$queryRaw<{ lead_id: string; contact_name: string | null }[]>`
        SELECT DISTINCT l.lead_id, l.contact_name
          FROM crm.leads l
          JOIN crm.contacts c ON c.lead_id = l.lead_id AND c.tenant_id = l.tenant_id
         WHERE l.tenant_id = ${this.tenantId}::uuid
           AND l.deleted_at IS NULL
           AND c.deleted_at IS NULL
           AND ((${email}::text IS NOT NULL AND lower(c.email) = lower(${email}::text))
             OR (${phone}::text IS NOT NULL AND c.phone = ${phone}::text))
      `,
    );

    // `tax_id` and `address` are returned ONLY where vendor_type = 'INDIVIDUAL'. On a JURISTIC or
    // unrecorded (NULL) row they are the company's, not this person's, and handing them to a data
    // subject would disclose the tenant's supplier data under cover of a rights request — the
    // condition the @pdpa tag on those two columns states (migration 20260816000002).
    const vendors = await this.db.run(
      (tx) =>
        tx.$queryRaw<
          {
            vendor_id: string;
            vendor_name: string;
            contact_email: string | null;
            contact_phone: string | null;
            tax_id: string | null;
            address: string | null;
          }[]
        >`
        SELECT vendor_id, vendor_name, contact_email, contact_phone,
               CASE WHEN vendor_type = 'INDIVIDUAL' THEN tax_id  ELSE NULL END AS tax_id,
               CASE WHEN vendor_type = 'INDIVIDUAL' THEN address ELSE NULL END AS address
          FROM procurement.vendors
         WHERE tenant_id = ${this.tenantId}::uuid
           AND ((${email}::text IS NOT NULL AND lower(contact_email) = lower(${email}::text))
             OR (${phone}::text IS NOT NULL AND contact_phone = ${phone}::text))
      `,
    );

    // `workforce.workers` — the entity §11.4 calls "Employee" (`full_name`, `contact_phone`). It
    // was in the specification's erasure table from the start and in neither this search nor the
    // anonymisation until 2026-08-23 (TDD OQ-48), so a site worker's own record was invisible to
    // their PDPA request against the tenant that employs them.
    //
    // Two ways in, because the row holds only ONE of the two identifiers a subject can give:
    //   phone — `contact_phone`, matched directly, like every other table here.
    //   email — the worker row has no email column at all. It is reached through `user_id`, the
    //           same shape `crm.leads` uses to reach itself through its contacts. This cannot
    //           over-match: `uq_workers_user_id` is unique per tenant and `platform.users.email` is
    //           one row, so an email resolves to at most one worker.
    //
    // Reading `platform.users` to MATCH is not the same as erasing it — that half is still open
    // (OQ-48), and this query only ever selects the worker's own two columns.
    const workers = await this.db.run(
      (tx) =>
        tx.$queryRaw<{ worker_id: string; full_name: string; contact_phone: string | null }[]>`
        SELECT w.worker_id, w.full_name, w.contact_phone
          FROM workforce.workers w
         WHERE w.tenant_id = ${this.tenantId}::uuid
           AND ((${phone}::text IS NOT NULL AND w.contact_phone = ${phone}::text)
             OR (${email}::text IS NOT NULL AND w.user_id IN (
                   SELECT u.user_id FROM platform.users u
                    WHERE u.tenant_id = ${this.tenantId}::uuid
                      AND lower(u.email) = lower(${email}::text)
                 )))
      `,
    );

    return [
      ...contacts.map((c) => ({
        source: 'crm.contacts' as const,
        id: c.contact_id,
        fields: { name: c.name, email: c.email, phone: c.phone },
      })),
      ...leads.map((l) => ({
        source: 'crm.leads' as const,
        id: l.lead_id,
        fields: { contact_name: l.contact_name },
      })),
      ...vendors.map((v) => ({
        source: 'procurement.vendors' as const,
        id: v.vendor_id,
        fields: {
          vendor_name: v.vendor_name,
          contact_email: v.contact_email,
          contact_phone: v.contact_phone,
          tax_id: v.tax_id,
          address: v.address,
        },
      })),
      // `employee_code` and `trade_type` are deliberately absent: they are the tenant's employment
      // record, not the subject's personal data, and §11.4 lists only these two fields.
      ...workers.map((w) => ({
        source: 'workforce.workers' as const,
        id: w.worker_id,
        fields: { full_name: w.full_name, contact_phone: w.contact_phone },
      })),
    ];
  }

  // ── Erasure ─────────────────────────────────────────────────────────────────

  /**
   * Anonymise in place — clear the personal columns, keep the row (QM-5; ADR-090 §5).
   *
   * A hard delete is not available here and would not be correct if it were: `crm.contacts.lead_id`
   * is `NOT NULL REFERENCES crm.leads`, and a lead converts into an opportunity and then a
   * `finance.customers` row that Thai accounting law keeps for seven years. Clearing the columns
   * removes the person; deleting the row would break a chain the tenant must retain.
   *
   * `crm.contacts.name` is `NOT NULL`, so it takes a marker rather than NULL. The marker is a
   * constant, not a per-row pseudonym: a stable pseudonym would still single the person out, which is
   * the thing anonymisation is for.
   *
   * Vendor `tax_id`/`address` are cleared ONLY on an INDIVIDUAL row, for the same reason the search
   * withholds them — on a company row they were never this person's data.
   *
   * THE ORDER OF THE FIVE STATEMENTS IS LOAD-BEARING, because two of them match through a table an
   * earlier one has already rewritten:
   *   1. contacts — matched directly by the identifiers.
   *   2. leads    — reached through contacts already marked `[ERASED]`. Must follow (1).
   *   3. vendors  — independent.
   *   4. workers  — an email is resolved through `platform.users`, so this must run BEFORE (5)
   *                 clears that email. Reversing 4 and 5 makes every email-only worker erasure
   *                 silently match nothing and report a clean result.
   *   5. users    — last, for exactly that reason.
   *
   * Every statement returns the ids it changed, not just a count: the caller writes one audit row per
   * erased record (§11.4, PO decision 2026-08-23). Ids are not personal data and may live in
   * `audit_logs.metadata`; the erased VALUES never may (QM-8).
   */
  async anonymise(email: string | null, phone: string | null): Promise<AnonymisationResult> {
    const contacts = await this.db.run(
      (tx) =>
        tx.$queryRaw<{ contact_id: string }[]>`
        UPDATE crm.contacts
           SET name = '[ERASED]', email = NULL, phone = NULL, updated_at = now()
         WHERE tenant_id = ${this.tenantId}::uuid
           AND deleted_at IS NULL
           AND ((${email}::text IS NOT NULL AND lower(email) = lower(${email}::text))
             OR (${phone}::text IS NOT NULL AND phone = ${phone}::text))
        RETURNING contact_id::text
      `,
    );

    // The lead's own personal column. Scoped through its contacts, the same way the search reaches
    // it. `company` is untouched — a juristic person is not a data subject.
    const leads = await this.db.run(
      (tx) =>
        tx.$queryRaw<{ lead_id: string }[]>`
        UPDATE crm.leads
           SET contact_name = NULL, updated_at = now()
         WHERE tenant_id = ${this.tenantId}::uuid
           AND deleted_at IS NULL
           AND lead_id IN (
             SELECT c.lead_id FROM crm.contacts c
              WHERE c.tenant_id = ${this.tenantId}::uuid
                AND c.name = '[ERASED]'
           )
        RETURNING lead_id::text
      `,
    );

    const vendors = await this.db.run(
      (tx) =>
        tx.$queryRaw<{ vendor_id: string }[]>`
        UPDATE procurement.vendors
           SET contact_email = NULL,
               contact_phone = NULL,
               tax_id  = CASE WHEN vendor_type = 'INDIVIDUAL' THEN NULL ELSE tax_id  END,
               address = CASE WHEN vendor_type = 'INDIVIDUAL' THEN NULL ELSE address END,
               updated_at = now()
         WHERE tenant_id = ${this.tenantId}::uuid
           AND ((${email}::text IS NOT NULL AND lower(contact_email) = lower(${email}::text))
             OR (${phone}::text IS NOT NULL AND contact_phone = ${phone}::text))
        RETURNING vendor_id::text
      `,
    );

    // `workforce.workers` — §11.4's "Employee" row, in the specification's erasure table since it was
    // written and in this method until 2026-08-23 (TDD OQ-48).
    //
    // `full_name = '[ERASED]'`, not NULL: the column is NOT NULL, the same reason `crm.contacts.name`
    // takes a placeholder rather than a null. `contact_phone` is nullable and goes to NULL.
    //
    // Nothing else on the row is touched. `employee_code` and `trade_type` are the tenant's
    // employment record rather than the subject's personal data, and `is_active` is not flipped: a
    // rights request is not a resignation, and turning a worker inactive would silently change site
    // rosters and attendance. Erasure clears what identifies the person, and stops.
    //
    // No `updated_at` in the SET clause — unlike the three tables above, this table has no such
    // column. The row's identity and `created_at` survive, which is what keeps
    // `workforce.project_workforce` referentially intact.
    const workers = await this.db.run(
      (tx) =>
        tx.$queryRaw<{ worker_id: string }[]>`
        UPDATE workforce.workers
           SET full_name = '[ERASED]',
               contact_phone = NULL
         WHERE tenant_id = ${this.tenantId}::uuid
           AND ((${phone}::text IS NOT NULL AND contact_phone = ${phone}::text)
             OR (${email}::text IS NOT NULL AND user_id IN (
                   SELECT u.user_id FROM platform.users u
                    WHERE u.tenant_id = ${this.tenantId}::uuid
                      AND lower(u.email) = lower(${email}::text)
                 )))
        RETURNING worker_id::text
      `,
    );

    // `platform.users` — the account itself (PO decision 2026-08-23, TDD OQ-48).
    //
    // This is the one table where erasure and DEACTIVATION cannot be separated. Everywhere else the
    // row keeps working with the person taken out of it — a worker still holds their slot on a
    // roster. An account cannot: `display_name`, `email` and `phone_number` ARE how the person signs
    // in and how anyone finds them, so removing them ends the account by definition. `is_active =
    // false` is therefore part of the erasure rather than an extra; leaving it `true` would advertise
    // a live account that nobody can use or identify.
    //
    // `email = ''` rather than NULL — the column is `NOT NULL`. Empty is safe where a marker would
    // not be: `users_tenant_email_idx` is NOT unique, so any number of erased accounts can share it,
    // and no login path matches an empty string. `phone_number` goes to NULL, which is what the
    // PARTIAL unique index (`WHERE phone_number IS NOT NULL`, migration 20260819000001) requires — a
    // placeholder there would collide on the second erasure in a tenant.
    //
    // `keycloak_user_id` is RETURNED, not cleared: it is `NOT NULL UNIQUE`, and the caller needs it to
    // erase the matching Keycloak account. Without that second half the person is still fully named in
    // the identity provider and can still log in.
    //
    // The row itself survives. It anchors `platform.audit_logs.actor_id`, `tenant_memberships` and
    // every `created_by` / `recorded_by` in the system — deleting it would tear holes in the audit
    // trail QM-4 requires to be both append-only and complete.
    const users = await this.db.run(
      (tx) =>
        tx.$queryRaw<{ user_id: string; keycloak_user_id: string }[]>`
        UPDATE platform.users
           SET display_name = '[ERASED]',
               email = '',
               phone_number = NULL,
               is_active = false,
               updated_at = now()
         WHERE tenant_id = ${this.tenantId}::uuid
           AND ((${email}::text IS NOT NULL AND lower(email) = lower(${email}::text))
             OR (${phone}::text IS NOT NULL AND phone_number = ${phone}::text))
        RETURNING user_id::text, keycloak_user_id
      `,
    );

    return {
      contacts: contacts.map((r) => r.contact_id),
      leads: leads.map((r) => r.lead_id),
      vendors: vendors.map((r) => r.vendor_id),
      workers: workers.map((r) => r.worker_id),
      users: users.map((r) => ({ userId: r.user_id, keycloakUserId: r.keycloak_user_id })),
    };
  }

  /**
   * The Keycloak realm this tenant's accounts live in.
   *
   * Read through the tenant-scoped connection, not the privileged one: `rls_tenants_read` (migration
   * 20260804000001) restricts `app_user` to its own tenant's row precisely so a request-scoped path
   * like this one cannot reach another tenant's realm — or its `dedicated_db_url`, which is why that
   * policy was tightened. Only `keycloak_realm` is selected.
   */
  async findTenantRealm(): Promise<string | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<{ keycloak_realm: string }[]>`
        SELECT keycloak_realm FROM platform.tenants
         WHERE tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0]?.keycloak_realm ?? null;
  }

  // ── Verification (ADR-090 §6) ───────────────────────────────────────────────

  /**
   * Record that a challenge was sent, and to where.
   *
   * `sentTo` is the identifier copied from the MATCHED RECORD, not from the request — the service
   * enforces that, and storing it here is what lets an auditor see WHICH address was proved rather
   * than only that something was.
   *
   * Re-issuing replaces the previous hash, so an earlier link stops working. `verified_at` is reset
   * to NULL with it: a fresh challenge means the old proof no longer describes the live token.
   */
  async recordChallenge(params: {
    requestId: string;
    tokenHash: string;
    sentTo: string;
  }): Promise<void> {
    await this.db.run(
      (tx) =>
        tx.$executeRaw`
        UPDATE platform.subject_requests
           SET verification_token_hash = ${params.tokenHash},
               verification_sent_to = ${params.sentTo},
               verification_sent_at = now(),
               verification_method = 'EMAIL_LINK',
               verified_at = NULL
         WHERE request_id = ${params.requestId}::uuid
           AND tenant_id = ${this.tenantId}::uuid
      `,
    );
  }

  /**
   * Mark the request verified, by TOKEN HASH.
   *
   * Runs on the PUBLIC confirm endpoint, where there is no session — but it is still tenant-scoped
   * and still under RLS, because `SubjectVerifyTokenGuard` publishes the tenant from the token's own
   * signed claim into CLS before this is reached (the shape ContractSignTokenGuard established for
   * ADR-058). So an unscoped query was never needed: the token IS the tenant context.
   *
   * `verified_at IS NULL` is what makes the link single-use.
   *
   * Returns false when nothing matched — already used, re-issued, or never existed. The caller must
   * not report a successful verification on an UPDATE that changed nothing.
   */
  async markVerifiedByTokenHash(tokenHash: string): Promise<boolean> {
    const changed = await this.db.run(
      (tx) =>
        tx.$executeRaw`
        UPDATE platform.subject_requests
           SET verified_at = now()
         WHERE verification_token_hash = ${tokenHash}
           AND tenant_id = ${this.tenantId}::uuid
           AND verified_at IS NULL
      `,
    );
    return changed > 0;
  }

  // ── Audit ───────────────────────────────────────────────────────────────────

  /**
   * Write the search/erase audit row.
   *
   * The global AuditInterceptor covers mutating verbs, and the SEARCH is a GET — so without this it
   * would be the one privileged action here that left no trace, which is precisely the action
   * ADR-090 §4 requires to be traceable. It also carries what the interceptor cannot know: the
   * request the search was authorised by, and how many records it returned.
   *
   * `metadata` holds the match count, never the matches: audit rows must not become a second copy of
   * the personal data (QM-8 — IDs only).
   */
  async writeAudit(params: {
    actorId: string;
    action: string;
    requestId: string;
    matches: number;
  }): Promise<void> {
    await this.db.run(
      (tx) =>
        tx.$executeRaw`
        INSERT INTO platform.audit_logs (tenant_id, actor_id, action, resource_type, resource_id, metadata)
        VALUES (
          ${this.tenantId}::uuid,
          ${params.actorId}::uuid,
          ${params.action},
          'subject_requests',
          ${params.requestId}::uuid,
          ${JSON.stringify({ matches: params.matches })}::jsonb
        )
      `,
    );
  }

  /**
   * One audit row per record erased (§11.4, PO decision 2026-08-23 — TDD OQ-48).
   *
   * The per-REQUEST row `writeAudit` writes says four rows were erased. It cannot say WHICH four, so
   * an auditor asking "was this person's worker record erased?" had no way to answer from the trail —
   * only from the erased tables themselves, which by then no longer name the person. That is the gap
   * §11.4 described with a `{ event: 'pii.erased', entity_type, entity_id }` entry, specified since
   * the section was written and never built.
   *
   * `resource_type` is the table, `resource_id` the row's own id, so the entry reads the same way
   * every other audit row does. `metadata` carries the marker and the request that authorised it —
   * ids and constants only. The erased VALUES are never written here: an audit log that recorded what
   * it deleted would be a second copy of the personal data, surviving in an append-only table that by
   * design cannot be erased in turn (QM-4, QM-8).
   *
   * One statement for all of them: an erasure that touched five tables should not cost five
   * round-trips, and a partial write would leave a trail claiming less than actually happened.
   */
  async writeErasureAudit(
    actorId: string,
    requestId: string,
    entries: Array<{ resourceType: ErasedResourceType; resourceId: string }>,
  ): Promise<void> {
    if (entries.length === 0) return;

    const rows = entries.map((e) => ({
      resource_type: e.resourceType,
      resource_id: e.resourceId,
      metadata: JSON.stringify({ event: 'pii.erased', request_id: requestId }),
    }));

    await this.db.run(
      (tx) =>
        tx.$executeRaw`
        INSERT INTO platform.audit_logs (tenant_id, actor_id, action, resource_type, resource_id, metadata)
        SELECT ${this.tenantId}::uuid,
               ${actorId}::uuid,
               'PII_ERASED',
               r->>'resource_type',
               (r->>'resource_id')::uuid,
               (r->>'metadata')::jsonb
          FROM jsonb_array_elements(${JSON.stringify(rows)}::jsonb) AS r
      `,
    );
  }
}
