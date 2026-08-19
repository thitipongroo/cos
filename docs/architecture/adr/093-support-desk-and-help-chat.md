# ADR-093: Support desk and Help Chat — where a support conversation lives

**Date:** 2026-08-18
**Status:** Accepted
**Deciders:** Product owner, Security Lead
**Tags:** security | data | ai | mobile

---

## Context

`mockup/mobile/01_authen/05_get_help/` draws three screens, added 2026-08-17 and renumbered from
`07_get_help/` on 2026-08-18:

| Drawing              | What it draws                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `01_home_support`    | The Support Centre already in the product, plus a `chevron_right` on the IT Hotline and Help Chat cards                        |
| `02_hotline_details` | A hotline number, operating hours (`24/7` / `08:00–18:00`), a preparation checklist, and two regional hotlines                 |
| `03_help_chat`       | A live conversation: `AGENT ONLINE`, `Secure Session • Ticket #8824`, agent and user bubbles, quick-action chips, a composer   |

**None of it had anything behind it.** Verified 2026-08-18:
`grep -niE "support|hotline|emergency|chat|ticket|faq|help_article" backend/prisma/schema.prisma`
returns only `PrivacyInquiry.message`; `grep -rhoE "@Controller\('[^']*'\)"` over
`backend/src/**/*.controller.ts` lists 24 prefixes and none of them is support, chat or ticket. Spec
§32.7 recorded the consequence on 2026-08-17 — *"Search stays disabled and Quick Help Chat stays
unavailable on BOTH routes … there is no `help_article`/`faq` table, no search endpoint and no chat"*
and *"No ticket: no ticket table exists either."*

The product owner decided on 2026-08-18 to **build the backing rather than draw dead controls**, and
answered the four questions that decision opens:

1. **Help Chat is answered by AI first and escalates to a person.**
2. **Desk data is platform-level fallback with a per-tenant override.**
3. **Help Chat is available pre-auth AND post-auth.**
4. The Support Centre's IT Hotline card **navigates** to the detail screen instead of dialling in
   place; `CALL NOW` on that screen is the dial.

Decision 3 is the one that shapes everything. A pre-auth caller has no JWT, so
`app.current_tenant_id` is unset and every RLS policy of the standard shape denies every row. This is
the same difficulty ADR-091 met with pre-auth privacy inquiries, and it is settled the same way.

## Decision

### 1. The desk is two tables, not one, because only one of them can be public

| Table                            | `tenant_id` | RLS                        | Written by     | Read by                       |
| -------------------------------- | ----------- | -------------------------- | -------------- | ----------------------------- |
| `platform.support_desk_default`  | none        | none — nothing to scope by | `SYSTEM_ADMIN` | **public**, incl. pre-auth    |
| `platform.tenant_support_desks`  | NOT NULL    | ENABLE + FORCE, standard   | `TENANT_ADMIN` | that tenant, post-auth only   |

`GET /api/v1/support/desk` is **public** and returns the default row alone. When the caller presents a
JWT, the tenant's row is read under RLS and merged over it field by field — an unset override field
falls through to the default rather than blanking it.

A single table with a nullable `tenant_id` was rejected: it cannot be given the standard RLS policy
(the fallback row has no tenant and must be readable with no tenant context), and a tenant-scoped
table without RLS is exactly what the §Never rule forbids. Splitting them lets each table take the
rule that actually applies to it.

**Operating hours and regional hotlines are columns on both tables**, which is what makes decisions 2
and 3 answerable at all: the drawing's `24/7`, `08:00–18:00`, `Bangkok HQ` and `Eastern Seaboard` are
now values a deployment sets, not text this repository asserts. Unset ⇒ the block does not render.
The drawn numbers (`+1 (800) 555-0199`, `+66 2 555 0100`, `+66 38 555 0101`) are placeholders and are
committed nowhere.

**`EXPO_PUBLIC_SUPPORT_CENTER_PHONE` / `EXPO_PUBLIC_SUPPORT_IT_HOTLINE` stay** as the last fallback,
below the platform row. They are what the app has when the backend cannot be reached — which is the
one state a support screen must survive, because a person opens it *because* something is broken.
Order: tenant override → platform default → env → control disabled and says so.

### 2. One ticket table that both an account holder and a stranger can open

`platform.support_tickets` carries a **nullable** `tenant_id` and a **nullable** `opened_by`. Both are
NULL for a pre-auth ticket. The RLS policy is the standard one widened by exactly one case:

```sql
USING (tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
```

With no tenant context the GUC is empty, `NULLIF` yields NULL, and `IS NOT DISTINCT FROM` matches the
rows whose `tenant_id` is NULL — the anonymous set, and nothing else. With a tenant context it
behaves exactly as `rls_tenant_isolation` does everywhere else. **RLS therefore remains the primary
isolation mechanism on this table** (spec §7.7), which a service-layer-only check would not.

RLS scopes the anonymous set but cannot divide it, so **an anonymous ticket is addressed by an
unguessable token**, not by its id: `access_token_hash` holds a SHA-256 of a token minted once and
returned once, and every anonymous read and write presents it. This is the Vendor Portal's Tier-1
magic-link pattern (spec §5.4.3, ADR-030) applied to a ticket, and the `reference` column is the
human-quotable handle in the ADR-091 sense — a handle, never an authenticator.

### 3. AI answers first; escalation to a person is a state, not a second system

`support_messages.sender_type ∈ { USER, AI, HUMAN_AGENT, SYSTEM }`, and the ticket moves
`OPEN → AI_HANDLING → ESCALATED → RESOLVED | CLOSED`. Escalation is a status change on the same
ticket and the same message thread, so nothing is re-keyed when a person takes over.

Every AI turn goes through `LLMProvider` and the Phase 12 `HallucinationGuard` — never the OpenAI SDK
(§Never), never a bypass (§Never "Skip hallucination guard"). The guard's verdict is **stored on the
message** (`model_used`, `confidence`, `low_confidence`) and rendered, the way `<ProcurementInsight />`
already renders exactly what `/ai/reports/procurement-summary` returns and no more. A
`low_confidence` turn says so in the thread rather than being presented as an answer.

The chat is **advisory** (§22.3 Mode A/B). It may not transition a workflow, approve anything, or
mutate financial data — the §22.3 high-risk prohibition, restated here because a chat surface is
where "just do it for me" gets asked.

**`AGENT ONLINE` is not implemented as drawn.** There is no agent presence service and no
`SUPPORT_AGENT` role in §6.2. The header states what is true of the ticket: the assistant is ready, or
a person has been asked for and has not answered yet. Labelling an AI turn as a human agent is the
same misstatement ADR-081 forbids in the other direction, and the drawing's `Terminal 01, your
technical support agent` self-introduction is not used.

**Human escalation needs a console, and it is not in this change.** No §6.2 role can read another
user's ticket, so an escalated ticket is visible to `SYSTEM_ADMIN` only until that role and surface
exist. `ESCALATED` is therefore honest but slow, and the screen says a person will reply rather than
implying one is watching.

### 4. Behind a feature flag, rate-limited, and PDPA-tagged

`s1.support.help-chat` (QM-15: a new UI surface and a write path reachable without an account).
`@Throttle` at the AI endpoint rate — 20 req/min per tenant (QM-7) — and per IP for the anonymous
path. A message body is free text a person may put anything into, so it is tagged
`@pdpa(category: "operational")` and retained per `docs/compliance/data-retention-policy.md`.

## Rationale

**Why the desk is data and not more env vars.** Two numbers fitted in `.env` (PO 2026-08-09). Hours,
a regional list and a per-tenant override do not: a list in an env var is a parsing problem with no
validation and no admin surface, and the override is per-tenant by definition, which `.env` cannot
express. The env vars survive as the offline fallback, which is the job they are actually good at.

**Why `IS NOT DISTINCT FROM` rather than dropping RLS on tickets.** The alternative offered was a
service-layer ownership check, which is precisely the "application-layer `WHERE tenant_id = $1` is
SECONDARY defense-in-depth, not a replacement for RLS" that §7.7 rules out. The widened policy keeps
the database as the enforcement point and adds one well-defined case for rows that belong to no
tenant.

**Why a token on anonymous tickets.** Without it, RLS admits an anonymous session to every anonymous
ticket — a strictly worse position than not building the feature. The token makes the anonymous set
addressable one row at a time and is stored hashed, so the database never holds the credential.

**Why AI first rather than a human queue.** A human queue with no console and no role to staff it is
an affordance that silently never answers — the failure mode this whole change exists to remove. AI
answers immediately and honestly, and escalation records that a person is needed rather than
pretending one is present.

**Why the preparation checklist is rewritten.** The drawing asks for `Device ID or Asset Tag`
(*"Located on the back of the device hardware"*), `Site Location` and `Error Code`. Two of the three
are real here and one is not: this platform has no asset tag on the back of anything, but it does
have a device record (ADR-082/083) the app can read, a project code from `projectStore`, and a
`COS-{DOMAIN}-{NNN}` error code that every error response actually carries (QM-10). The checklist
names those.

## Consequences

- **First widened RLS policy in the codebase.** `rls_tenant_or_anonymous` is a second policy shape.
  Anything that audits policies by matching the `rls_tenant_isolation` text must be taught about it.
- **First platform table a pre-auth caller can write to twice.** `privacy_inquiries` takes one
  submission; a chat takes a stream. The rate limit is load-bearing, not decorative.
- **`ESCALATED` has no consumer yet.** Until a support-agent role and console exist, an escalated
  ticket waits on `SYSTEM_ADMIN`. This is recorded in the screen's copy, not hidden.
- **Spec §32.7 changes twice.** *"Quick Help Chat stays unavailable on BOTH routes"* and *"no ticket
  table exists either"* both stop being true, and the Support Centre's `Reference` cell stops being
  `drawing withdrawn 2026-08-15` — there are three drawings again.
- **The AI answers about this product.** The chat's retrieval corpus is the same troubleshooting copy
  the Support Centre already renders plus the module matrix; there is still no `help_article` table,
  so **Search stays disabled** — nothing in this change gives it a corpus to search.
