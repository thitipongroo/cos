# 090: External data subjects — Construction OS is the processor, and the tenant gets the tooling

**Date:** 2026-08-16
**Status:** Accepted
**Deciders:** Product owner (thitipongroo), engineering
**Tags:** compliance, pdpa, data, crm, procurement

---

## Context

`docs/compliance/pdpa-controls.md` records **PDPA-40 (RoPA)** as `PARTIAL`, evidenced by
`data-flow-map.md` — "8 service flows + processor table". Auditing the `@pdpa` column tags against
the migrations rather than against the export collector showed that those eight flows describe only
one kind of data subject: **someone with a platform account**.

Three tables hold personal data about people who have no account, and none of them was tagged, mapped
or retained-for:

| Table                 | Columns                                                                  | Who the person is                           |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| `crm.contacts`        | `name` (NOT NULL), `email`, `phone`                                      | A named person at a prospect                |
| `crm.leads`           | `contact_name`                                                           | The person a lead is held against           |
| `procurement.vendors` | `contact_email`, `contact_phone`, and conditionally `tax_id` / `address` | The person a buyer deals with at a supplier |

The omission was structural rather than careless. `20260803000001_tag_pii_columns` and
`20260804000005_tag_pii_columns_v2` both scoped themselves to what `data-export.collector.ts` reads,
and that collector is keyed by `userId`; ADR-078 made the tags "the authoritative scope statement",
so a person the collector could not reach was a person nothing prompted anyone to tag. The result was
a compliance record that read as a claim the platform holds no personal data about these people.
`crm` appears nowhere in `docs/compliance/`, and `ADR-029` (CRM MVP) does not mention PDPA, PII or
consent.

**"It is only business contact data" was examined and does not hold in Thailand.** Singapore's PDPA
§4(5) exempts business contact information used for B2B purposes; Thailand's PDPA has no equivalent
provision. Its definition — data enabling the identification of a person, whether directly or
indirectly — covers a named individual's work email and phone, and it follows the GDPR model on this
point rather than Singapore's. A work address belongs to the person, not only to their employer.

## Decision

### 1. Construction OS is the PROCESSOR for tenant-entered records about external people

The tenant decides to record these people and why; Construction OS stores and processes them on the
tenant's instruction. The tenant is the controller.

This is the ordinary shape of multi-tenant SaaS and it is stated here because the platform previously
described only the other half of the relationship: `data-flow-map.md` § Third-party processors lists
processors **COS sends data to** (AWS, OpenAI, Cloudflare), and nothing recorded where COS is itself
the processor. Both directions now appear, under § Controller and processor roles.

### 2. The role changes who answers a data subject — it does not remove the duty to inventory

**PDPA §40 places a record-of-processing duty on a processor in its own right**, covering the
categories of processing carried out on behalf of each controller, with administrative fines up to
THB 5,000,000. The SME exemption does not rescue this case: it does not apply where processing is not
occasional, and CRM and vendor records are processed continuously.

So the columns are tagged (`20260816000002_tag_external_party_pii`) and the flows are mapped
(`data-flow-map.md` §9, §10) exactly as for data where COS is the controller. The tag carries the
role — `@pdpa(category: …, role: "processor")` — so the inventory query in `20260803000001` returns
the role alongside the category and the two kinds of data cannot be read as one.

### 3. A request that arrives at Construction OS is routed to the tenant

Construction OS does not answer substantively on the tenant's behalf. This follows the settled
processor pattern — HubSpot's DPA states it plainly: if a data subject request reaches the processor,
it informs the customer and directs the subject to them, the customer being "solely responsible for
responding substantively". Answering directly would mean deciding, on a controller's behalf and
without its lawful basis, what that controller holds and why.

### 4. The tenant is given tooling, not a manual process

The counterpart to (3): a controller cannot answer if it cannot search. Salesforce's Privacy Center
is the reference shape — the platform ships the mechanism (`DsarPolicy`, portability and anonymisation
policies) and the customer's own admin executes it. Construction OS gives `TENANT_ADMIN` the same
three capabilities over §9/§10 data: find a person, export what is held about them, and erase them.

**Every search is bound to a subject-request record and audited.** A free lookup by email would be an
oracle answering "is this address in your customer base" — which is both an enumeration surface and a
use of the tenant's data for a purpose no data subject asked for. So a request record is created
first, every search cites it, and each search writes an `audit_logs` row carrying the actor, the
request, and the number of matches. This is also what GDPR Article 12 asks of the controller — an
auditable record of receipt, identity check, extension and outcome — kept where the search happens.

**Identity verification stays with the tenant, deliberately.** The person operating the tool is the
admin, not the data subject, and the tenant is the controller: verification happens off-platform,
against whatever the tenant already knows about that person. Requiring a step-up from the ADMIN was
considered and rejected — it adds friction to a routine job without verifying the party whose
identity is actually in question, and Article 12(2)/12(6) makes over-verification an infringement in
its own right rather than a free precaution.

### 5. Erasure is anonymisation in place, with a legal-hold copy

QM-5 already fixes the method — _"anonymization-in-place preferred over cascade delete (preserves
aggregate analytics)"_ — and the schema leaves no alternative: `crm.contacts.lead_id` is
`NOT NULL REFERENCES crm.leads`, and a lead converts into an opportunity and then a
`finance.customers` row that Thai accounting law requires be kept for seven years. Deleting the
contact would break a chain the tenant is legally obliged to retain.

Erasure therefore clears the personal columns and keeps the row. Where a record is under
`legal_hold`, the pre-anonymisation values go to a restricted archive readable by legal/compliance
only, rather than being discarded — the conditional-erasure shape: personal data leaves the
operational system, the record the law requires survives. GDPR Article 17(3)(b) and its PDPA
equivalent permit exactly this, on the condition that the basis is stated specifically; answering a
subject with "kept for legal reasons" without naming the law, the categories and the period is itself
a breach, which is why `data-retention-policy.md` now names a statute per row.

## Consequences

### Positive

- PDPA-40 is evidenced for the processor half of the platform's processing, not only the controller
  half. The inventory query in `20260803000001` now returns these columns with their role.
- The privacy notice can describe what the platform holds about external people without the map
  contradicting it.
- `vendor_type` makes a per-row judgement possible where the table previously forced one answer for
  both sole traders and companies.

### Negative / accepted

- `vendor_type` is nullable and **not backfilled**. Nothing in the schema distinguishes a sole trader
  from a company — `tax_id` is stored unvalidated by design (Phase 5, "multi-country format") and
  `vendor_name` is free text — so a backfill would be a guess, and a wrong guess mislabels a real
  person's tax id as company data. Existing rows read `NULL` = not recorded until an operator sets
  them, and consumers must treat NULL as unknown rather than as juristic.
- The tenant-facing tooling is new surface area: a subject-request table, three endpoints and an
  admin screen, all of which must carry RLS, audit and the QM-1 coverage bar.
- Subject rights for external people are only as good as the tenant's own process. COS can evidence
  that the mechanism exists and was used; it cannot evidence that the tenant verified the right
  person.

### Shipped in this change, and what is not

The API is built and covered: `platform.subject_requests` (migration `20260816000003`, RLS +
`app_user` grant), `SubjectRequestRepository` / `Service` / `Controller` under
`backend/src/modules/identity/subject-request/`, five TENANT_ADMIN routes documented in
`docs/api/auth.openapi.yaml`, 28 unit tests at 100% lines and branches.

Two parts of §4 and §5 are **not** built, and PDPA-48 says so in the register rather than here alone:

- **No admin screen.** The tooling is the API; a tenant without an integrator drives it from an API
  client. Nothing about the decisions above depends on the screen — it is a surface over routes that
  already enforce the role, the request-binding, the audit and the rate limit.
- **No legal-hold archive.** §5 says a row under `legal_hold` keeps its pre-anonymisation values in a
  restricted store. There is no such store in this platform, and inventing one (bucket, access
  control, retention sweep, who may read it) is its own decision rather than an implementation
  detail. Until it exists, anonymisation is unconditional: the personal columns are cleared and no
  pre-image is kept. A tenant that needs the archive behaviour must export the row before erasing.

## Alternatives considered

- **Treat it as out of scope on a B2B basis.** Rejected: Thailand has no B2B exemption (see Context),
  and PDPA §40 binds the processor regardless of who the controller is.
- **Tag the columns and stop there.** Rejected by the product owner: it discharges the record-keeping
  duty and leaves the tenant with no way to act on a request, which is the half a data subject
  actually experiences.
- **Answer subject requests centrally, from Construction OS.** Rejected: it puts the processor in the
  controller's seat, deciding lawful basis and scope for data it does not own.
- **Hard-delete on erasure.** Rejected: breaks `crm.contacts.lead_id` (`NOT NULL`) and destroys
  records under a seven-year statutory retention.

## References

- `context.md` QM-5 (PDPA/GDPR, erasure strategy, `@pdpa` tagging obligation)
- `docs/compliance/pdpa-controls.md` PDPA-40 · `docs/compliance/data-flow-map.md` §9, §10,
  § Controller and processor roles · `docs/compliance/data-retention-policy.md` § CRM data
- Migrations `20260816000001_add_vendor_type_to_vendors`, `20260816000002_tag_external_party_pii`;
  earlier passes `20260803000001_tag_pii_columns`, `20260804000005_tag_pii_columns_v2`
- [ADR-078](078-pdpa-data-export-and-step-up-otp.md) — the controller-side export this deliberately
  does not extend · [ADR-029](029-crm-module-mvp.md) — the CRM module, which did not cover PDPA
- Thailand PDPA §40 (processor record-keeping); §4 (scope, no B2B exemption); Singapore PDPA §4(5)
  (the B2B exemption Thailand lacks); GDPR Art 12(2)/12(6) (verification, over-verification),
  Art 17(3)(b) (legal-obligation exception)
- HubSpot DPA (processor routes requests to the customer); Salesforce Privacy Center / `DsarPolicy`
  (controller-executed tooling)
