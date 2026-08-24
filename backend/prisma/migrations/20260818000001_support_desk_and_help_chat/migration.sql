-- Support desk and Help Chat (ADR-093).
--
-- Backs the three drawings in mockup/mobile/01_authen/05_get_help/. Until this migration the product
-- had nothing behind any of them: `grep -niE "support|hotline|emergency|chat|ticket|faq"` over this
-- schema returned only PrivacyInquiry.message, which is why spec §32.7 recorded on 2026-08-17 that
-- Quick Help Chat was unavailable and "no ticket table exists either". Both statements stop being
-- true here.
--
-- WHY THESE TABLES LIVE IN platform. The Support Centre is reached from the OTP step, BEFORE sign-in
-- (PO decision 2026-08-18 keeps Help Chat available on both sides of login). A pre-auth caller has no
-- JWT, so `app.current_tenant_id` is unset and a standard RLS policy denies every row. Master §Phase 2
-- permits exactly this — "tenant_id UUID NOT NULL on every domain table (platform tables exempt)" —
-- and platform.privacy_inquiries (20260817000001) is the precedent. No new named schema is created:
-- master §Phase 2 enumerates the domain schemas and "support" is not one of them.
--
-- THE DESK IS TWO TABLES BECAUSE ONLY ONE OF THEM CAN BE PUBLIC (ADR-093 §1):
--   support_desk_default  — no tenant_id, no RLS, one row. Served to anyone, including pre-auth.
--   tenant_support_desks  — tenant_id NOT NULL, RLS ENABLE + FORCE, standard policy. Post-auth only.
-- A single table with a nullable tenant_id was rejected: the fallback row must be readable with no
-- tenant context, so it cannot take the standard policy, and a tenant-scoped table WITHOUT RLS is
-- what the §Never rule forbids. Split, each table takes the rule that applies to it.
--
-- THE TICKET TABLE USES A WIDENED POLICY, rls_tenant_or_anonymous. `tenant_id` is nullable there
-- because a stranger may open a ticket, and
--   tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
-- reduces to the standard policy when a tenant context is set, and matches the tenant_id IS NULL rows
-- when it is not. RLS therefore stays the PRIMARY isolation mechanism on these tables (spec §7.7)
-- instead of being replaced by a service-layer check, which §7.7 rules out. It is the first policy in
-- this codebase whose text is not `rls_tenant_isolation`; anything auditing policies by name must be
-- taught about it (ADR-093 Consequences).
--
-- RLS SCOPES THE ANONYMOUS SET BUT CANNOT DIVIDE IT, so an anonymous ticket is addressed by an
-- unguessable token whose SHA-256 is `access_token_hash` — the Vendor Portal Tier-1 magic-link shape
-- (spec §5.4.3, ADR-030). `reference` is the human-quotable handle in the ADR-091 sense and is NEVER
-- an authenticator.
--
-- Backward-compatible (QM-9): new types + new tables only. Nothing existing is touched.
-- Rollback: prisma/rollbacks/20260818000001_support_desk_and_help_chat.rollback.sql

-- ─── The desk ────────────────────────────────────────────────────────────────
-- Both desk tables carry the same shape, so a tenant row can override the platform row field by
-- field. An unset override column falls through to the default rather than blanking it — which is why
-- every column here except the key is NULLABLE on both.

-- One row, enforced by the CHECK below. A singleton rather than a key/value table because the fields
-- are a fixed, small set the API returns as one object, and a key/value store would let a typo
-- silently create a setting nothing reads.
CREATE TABLE IF NOT EXISTS platform.support_desk_default (
  -- Pinned to TRUE so the table can hold exactly one row. `PRIMARY KEY` on a BOOLEAN with a CHECK is
  -- the standard singleton idiom; a sequence would allow a second row to exist and be ignored.
  singleton              BOOLEAN     PRIMARY KEY DEFAULT TRUE,

  -- The two numbers the Support Centre already dials, promoted out of EXPO_PUBLIC_SUPPORT_* config.
  -- Free-form: the value is handed to the device dialler as `tel:` and every country writes its own.
  support_center_phone   VARCHAR(50),
  it_hotline_phone       VARCHAR(50),

  -- The hotline detail screen's header block (mockup 02_hotline_details).
  it_hotline_label       VARCHAR(255),
  it_hotline_description TEXT,

  -- Operating hours. TEXT rather than two TIME columns on purpose: the drawing's own two rows are
  -- "24/7 Available" and "08:00 - 18:00", and a desk that is open round the clock has no open/close
  -- time to store. A deployment writes what is true of its desk.
  hours_critical         VARCHAR(120),
  hours_general          VARCHAR(120),

  -- Regional hotlines: [{ "label": "Bangkok HQ", "phone": "+66 2 555 0100" }, …]. JSONB because it is
  -- an ordered list of a fixed pair, read whole and never queried into; a child table would add a
  -- join and a sort column for no query this screen makes. The ELEMENT shape is enforced by the CHECK
  -- below as well as by the DTO (QM-4) — a `jsonb_typeof = 'array'` test alone would admit
  -- `[{"lable": …}]` and the screen would render a blank row for it.
  regional_hotlines      JSONB       NOT NULL DEFAULT '[]'::jsonb,

  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Who last wrote it. SYSTEM_ADMIN only (ADR-093 §1); NULL for the row this migration seeds.
  updated_by             UUID,

  CONSTRAINT support_desk_default_singleton CHECK (singleton),
  -- An array whose every element is an object carrying a string `label` and a string `phone`. Written
  -- as three jsonpath existence tests rather than one: a CHECK may not call a set-returning function
  -- such as jsonb_array_elements, and `@?` is immutable so it is allowed here. Extra keys on an
  -- element are tolerated on purpose — a later field must not invalidate rows already written.
  CONSTRAINT support_desk_default_regional_shape CHECK (
    jsonb_typeof(regional_hotlines) = 'array'
    AND NOT regional_hotlines @? '$[*] ? (@.type() <> "object")'
    AND NOT regional_hotlines @? '$[*] ? (!exists(@.label) || !exists(@.phone))'
    AND NOT regional_hotlines @? '$[*] ? (@.label.type() <> "string" || @.phone.type() <> "string")'
  )
);

-- Seed the single row with everything unset. The API must always find a row to merge onto, and an
-- empty row is the honest starting state: every control renders disabled and says no number is set,
-- exactly as the unconfigured env vars already make it do.
INSERT INTO platform.support_desk_default (singleton) VALUES (TRUE)
  ON CONFLICT (singleton) DO NOTHING;

-- The per-tenant override. Same columns, minus the ones a tenant may not set: a tenant does not get
-- to relabel the platform's own IT hotline description, but it does get its own numbers and hours.
CREATE TABLE IF NOT EXISTS platform.tenant_support_desks (
  tenant_id              UUID        PRIMARY KEY REFERENCES platform.tenants (tenant_id) ON DELETE CASCADE,

  support_center_phone   VARCHAR(50),
  it_hotline_phone       VARCHAR(50),
  it_hotline_label       VARCHAR(255),
  it_hotline_description TEXT,
  hours_critical         VARCHAR(120),
  hours_general          VARCHAR(120),
  regional_hotlines      JSONB       NOT NULL DEFAULT '[]'::jsonb,

  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by             UUID,

  -- Same element shape as the default row above, for the same reason: the two are merged field by
  -- field, so a malformed override would put a blank row on the screen exactly as a malformed
  -- default would.
  CONSTRAINT tenant_support_desks_regional_shape CHECK (
    jsonb_typeof(regional_hotlines) = 'array'
    AND NOT regional_hotlines @? '$[*] ? (@.type() <> "object")'
    AND NOT regional_hotlines @? '$[*] ? (!exists(@.label) || !exists(@.phone))'
    AND NOT regional_hotlines @? '$[*] ? (@.label.type() <> "string" || @.phone.type() <> "string")'
  )
);

-- Standard tenant isolation — this table is tenant-scoped and takes the ordinary policy (spec §7.7).
-- ENABLE and FORCE together, so the table owner cannot bypass it either.
ALTER TABLE platform.tenant_support_desks ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_support_desks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON platform.tenant_support_desks;
CREATE POLICY rls_tenant_isolation ON platform.tenant_support_desks
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- ─── Help Chat ───────────────────────────────────────────────────────────────

-- OPEN        — created, no turn taken yet
-- AI_HANDLING — the assistant is answering (§22.3 Mode A/B, advisory only)
-- ESCALATED   — a person has been asked for. No support-agent role or console exists yet, so this
--               waits on SYSTEM_ADMIN; the screen says so rather than implying someone is watching
--               (ADR-093 §3).
-- RESOLVED    — answered; reopenable by a further message
-- CLOSED      — terminal
-- Guarded, so a partial re-run does not stop at the first enum: every CREATE TABLE and CREATE INDEX
-- in this file is IF NOT EXISTS, and a bare CREATE TYPE would be the one statement that is not.
-- The DO/EXCEPTION form is the house idiom (20260531000003) — there is no CREATE TYPE IF NOT EXISTS.
DO $$ BEGIN
  CREATE TYPE platform."SupportTicketStatus" AS ENUM (
    'OPEN',
    'AI_HANDLING',
    'ESCALATED',
    'RESOLVED',
    'CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Who wrote a turn. HUMAN_AGENT is defined now and produced by nothing yet — the console that emits
-- it is out of this change — so that an escalated thread does not need a type added under it later.
-- SYSTEM is the thread's own notices (opened, escalated), which are not attributable to a person.
DO $$ BEGIN
  CREATE TYPE platform."SupportMessageSender" AS ENUM ('USER', 'AI', 'HUMAN_AGENT', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS platform.support_tickets (
  ticket_id         UUID                            PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Read off the screen and quoted back — the drawing prints "Ticket #8824". Application-generated,
  -- not a sequence, for ADR-091's reason: a monotonic reference shown to the public discloses how
  -- many tickets the platform has taken.
  reference         VARCHAR(32)                     NOT NULL UNIQUE,

  -- BOTH NULLABLE, and that is the point (ADR-093 §2). A pre-auth caller has neither.
  tenant_id         UUID                            REFERENCES platform.tenants (tenant_id) ON DELETE CASCADE,
  opened_by         UUID                            REFERENCES platform.users (user_id) ON DELETE SET NULL,

  -- SHA-256 of the token minted once when an ANONYMOUS ticket is opened and returned once. Every
  -- later read or write on that ticket presents the token. Hashed, so the database never holds the
  -- credential (spec §5.4.3). NULL on a ticket opened by a signed-in user: there the JWT is the
  -- credential and RLS the scope.
  access_token_hash CHAR(64),

  status            platform."SupportTicketStatus"  NOT NULL DEFAULT 'OPEN',
  opened_at         TIMESTAMPTZ                     NOT NULL DEFAULT now(),
  -- Set when status becomes ESCALATED. Kept separate from opened_at so the wait for a person is
  -- measurable — it is the number that says whether ESCALATED is honest or merely slow.
  escalated_at      TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,

  -- The device's own locale at open, so a reply is written back in the language it was asked in
  -- (QM-3). Not derived from Accept-Language at read time: the reader may be an operator elsewhere.
  locale            VARCHAR(16),

  -- An anonymous ticket is addressable only by its token; without one it could never be read again.
  CONSTRAINT support_tickets_anonymous_has_token
    CHECK ((tenant_id IS NULL AND access_token_hash IS NOT NULL)
        OR (tenant_id IS NOT NULL AND access_token_hash IS NULL)),
  -- opened_by belongs to a tenant. A row with an author but no tenant would be unreachable by RLS
  -- from either side.
  CONSTRAINT support_tickets_author_has_tenant
    CHECK (opened_by IS NULL OR tenant_id IS NOT NULL),
  -- One-directional, not a biconditional: escalated_at is STAMPED when the ticket escalates and stays
  -- stamped through RESOLVED and CLOSED, because how long the caller waited for a person is the
  -- number that says whether ESCALATED is honest. A biconditional would force it back to NULL on
  -- resolution and erase exactly that.
  CONSTRAINT support_tickets_escalated_has_timestamp
    CHECK (status <> 'ESCALATED' OR escalated_at IS NOT NULL),
  -- This one IS a biconditional: a closed ticket has a closing time and an open one has not.
  CONSTRAINT support_tickets_closed_has_timestamp
    CHECK ((status = 'CLOSED') = (closed_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS platform.support_messages (
  message_id     UUID                             PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID                             NOT NULL REFERENCES platform.support_tickets (ticket_id) ON DELETE CASCADE,

  -- Denormalised from the ticket so this table can carry the SAME policy. Without it every read here
  -- would have to join the ticket to be scoped, and RLS does not follow FKs.
  tenant_id      UUID                             REFERENCES platform.tenants (tenant_id) ON DELETE CASCADE,

  sender_type    platform."SupportMessageSender"  NOT NULL,
  -- Set only when sender_type = USER or HUMAN_AGENT and the writer had an account.
  sender_user_id UUID                             REFERENCES platform.users (user_id) ON DELETE SET NULL,

  -- @pdpa(category: "operational") — free text; a person may put anything in a support message,
  -- including their own contact details. Retained per docs/compliance/data-retention-policy.md.
  body           TEXT                             NOT NULL,

  -- WHAT THE ASSISTANT'S TURN WAS, RECORDED WITH IT. §22.3 forbids presenting a model's output as
  -- more than advice, and Phase 12's HallucinationGuard already computes these three; storing them
  -- with the message is what lets the thread RENDER the verdict rather than hide it, which is the
  -- rule <ProcurementInsight /> follows on the dashboard. NULL on every non-AI turn.
  model_used     VARCHAR(100),
  confidence     DECIMAL(4, 3),
  low_confidence BOOLEAN,

  sent_at        TIMESTAMPTZ                      NOT NULL DEFAULT now(),
  read_at        TIMESTAMPTZ,

  -- An AI turn without its verdict cannot be rendered honestly, and a non-AI turn has no verdict to
  -- render. Either both AI columns are present or the turn is not AI.
  CONSTRAINT support_messages_ai_has_verdict
    CHECK ((sender_type = 'AI') = (model_used IS NOT NULL AND confidence IS NOT NULL AND low_confidence IS NOT NULL)),
  CONSTRAINT support_messages_confidence_range
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  -- Only a person has a user id.
  CONSTRAINT support_messages_sender_user_is_human
    CHECK (sender_user_id IS NULL OR sender_type IN ('USER', 'HUMAN_AGENT'))
);

-- The widened policy, on both tables. See the header note for why the standard shape cannot be used
-- and why a service-layer check is not an acceptable substitute (spec §7.7).
--
-- THE ANONYMOUS SET IS DIVIDED IN THE DATABASE, NOT IN THE SERVICE. `tenant_id IS NOT DISTINCT FROM`
-- alone admits an anonymous session to EVERY anonymous ticket — the position ADR-093 Rationale calls
-- "strictly worse than not building the feature" — and leaving the token check to the service is the
-- application-layer substitute §7.7 rules out. So the token travels as a second GUC, set the same way
-- and in the same transaction as the tenant one:
--
--   SET LOCAL app.current_ticket_token = '<sha256 hex of the token the caller presented>';
--
-- and the policy compares it to the stored hash. Unset GUC → NULLIF yields NULL → `= NULL` is NULL →
-- no anonymous row matches, which is the correct default for a session that presented nothing.
-- A signed-in session is unaffected: `tenant_id IS NOT NULL` short-circuits the token term.
--
-- The SYSTEM_ADMIN operator queue does not go through this. It reads on the privileged `cos`
-- connection (DATABASE_URL), which is not `app_user` and is not subject to these policies — the same
-- split every platform/cross-tenant service already uses (20260623000001).
--
-- SELECT/UPDATE and INSERT are separate policies on purpose. An INSERT cannot present the token: it
-- is minted as part of the same call that writes the row, so requiring it there would make opening an
-- anonymous ticket impossible. Authoring a row is not a disclosure; reading one back is.
ALTER TABLE platform.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.support_tickets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_or_anonymous ON platform.support_tickets;
DROP POLICY IF EXISTS rls_tenant_or_anonymous_read ON platform.support_tickets;
DROP POLICY IF EXISTS rls_tenant_or_anonymous_write ON platform.support_tickets;
DROP POLICY IF EXISTS rls_tenant_or_anonymous_insert ON platform.support_tickets;
CREATE POLICY rls_tenant_or_anonymous_read ON platform.support_tickets
  AS PERMISSIVE
  FOR SELECT
  TO app_user
  USING (
    tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
    AND (tenant_id IS NOT NULL
         OR access_token_hash = NULLIF(current_setting('app.current_ticket_token', TRUE), ''))
  );
CREATE POLICY rls_tenant_or_anonymous_write ON platform.support_tickets
  AS PERMISSIVE
  FOR UPDATE
  TO app_user
  USING (
    tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
    AND (tenant_id IS NOT NULL
         OR access_token_hash = NULLIF(current_setting('app.current_ticket_token', TRUE), ''))
  )
  WITH CHECK (
    tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
    AND (tenant_id IS NOT NULL
         OR access_token_hash = NULLIF(current_setting('app.current_ticket_token', TRUE), ''))
  );
CREATE POLICY rls_tenant_or_anonymous_insert ON platform.support_tickets
  AS PERMISSIVE
  FOR INSERT
  TO app_user
  WITH CHECK (tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- support_messages has no token column of its own — the token addresses a TICKET — so the policy has
-- to resolve the caller's ticket. It cannot do that with a sub-SELECT: a policy on support_messages
-- that reads support_tickets re-enters that table's own policy, and PostgreSQL rejects the recursion.
-- A STABLE SECURITY DEFINER function owned by the migration role does the lookup outside RLS instead.
-- It is the ONLY way in, it takes no argument, and it reads the GUC itself — a caller cannot ask it
-- about a ticket other than the one whose token they already hold.
CREATE OR REPLACE FUNCTION platform.current_anonymous_ticket() RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT t.ticket_id
    FROM platform.support_tickets t
   WHERE t.tenant_id IS NULL
     AND t.access_token_hash = NULLIF(current_setting('app.current_ticket_token', TRUE), '');
$$;
COMMENT ON FUNCTION platform.current_anonymous_ticket() IS
  'Resolves app.current_ticket_token to the anonymous ticket it addresses, outside RLS, so the support_messages policy can scope to it without recursing into support_tickets. Returns NULL when the GUC is unset or matches nothing.';
REVOKE ALL ON FUNCTION platform.current_anonymous_ticket() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.current_anonymous_ticket() TO app_user;

ALTER TABLE platform.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.support_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_or_anonymous ON platform.support_messages;
DROP POLICY IF EXISTS rls_tenant_or_anonymous_read ON platform.support_messages;
DROP POLICY IF EXISTS rls_tenant_or_anonymous_write ON platform.support_messages;
DROP POLICY IF EXISTS rls_tenant_or_anonymous_insert ON platform.support_messages;
CREATE POLICY rls_tenant_or_anonymous_read ON platform.support_messages
  AS PERMISSIVE
  FOR SELECT
  TO app_user
  USING (
    tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
    AND (tenant_id IS NOT NULL OR ticket_id = platform.current_anonymous_ticket())
  );
CREATE POLICY rls_tenant_or_anonymous_write ON platform.support_messages
  AS PERMISSIVE
  FOR UPDATE
  TO app_user
  USING (
    tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
    AND (tenant_id IS NOT NULL OR ticket_id = platform.current_anonymous_ticket())
  )
  WITH CHECK (
    tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
    AND (tenant_id IS NOT NULL OR ticket_id = platform.current_anonymous_ticket())
  );
-- Unlike a ticket INSERT, a message INSERT CAN present the token — the ticket already exists by then.
-- So an anonymous writer is held to the one thread they hold the token for, which also denies the
-- anonymous half of the cross-thread write that FK checks would otherwise allow (FK lookups bypass
-- RLS, so `ticket_id` existing is not the same as `ticket_id` being visible).
CREATE POLICY rls_tenant_or_anonymous_insert ON platform.support_messages
  AS PERMISSIVE
  FOR INSERT
  TO app_user
  WITH CHECK (
    tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
    AND (tenant_id IS NOT NULL OR ticket_id = platform.current_anonymous_ticket())
  );

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- The operator queue: what is waiting, oldest first. ESCALATED tickets are read through this.
CREATE INDEX IF NOT EXISTS support_tickets_status_opened_idx
  ON platform.support_tickets (status, opened_at);

-- "My tickets" for a signed-in user.
CREATE INDEX IF NOT EXISTS support_tickets_tenant_opened_idx
  ON platform.support_tickets (tenant_id, opened_at DESC);

-- The token lookup on every anonymous request. Partial: only anonymous tickets have one, and the
-- index should not carry a row per signed-in ticket to say NULL.
CREATE INDEX IF NOT EXISTS support_tickets_access_token_idx
  ON platform.support_tickets (access_token_hash)
  WHERE access_token_hash IS NOT NULL;

-- The thread itself — every read of a ticket is "its messages in order".
CREATE INDEX IF NOT EXISTS support_messages_ticket_sent_idx
  ON platform.support_messages (ticket_id, sent_at);

-- The three REFERENCING columns no other index leads with. Postgres does not index the child side of
-- a foreign key, so without these, deleting one user or one tenant sequentially scans these tables to
-- apply ON DELETE SET NULL / CASCADE — and a support thread is append-only, so both tables only grow.
-- support_tickets.tenant_id needs nothing: support_tickets_tenant_opened_idx already leads with it.
CREATE INDEX IF NOT EXISTS support_tickets_opened_by_idx
  ON platform.support_tickets (opened_by)
  WHERE opened_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_messages_tenant_idx
  ON platform.support_messages (tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_messages_sender_user_idx
  ON platform.support_messages (sender_user_id)
  WHERE sender_user_id IS NOT NULL;

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- app_user is the NON-SUPERUSER role the application connects as; without a grant RLS is moot because
-- the table is unreachable (ADR-031). No DELETE anywhere: a support thread is a record of what was
-- asked and answered, and closing is a status change. The default desk row is SELECT-only for the
-- app — it is seeded by migration and edited by SYSTEM_ADMIN through the platform admin path, and a
-- row every deployment reads should not be writable by the request path that reads it.
GRANT SELECT                 ON platform.support_desk_default  TO app_user;
GRANT SELECT, INSERT, UPDATE ON platform.tenant_support_desks  TO app_user;
GRANT SELECT, INSERT, UPDATE ON platform.support_tickets       TO app_user;
GRANT SELECT, INSERT, UPDATE ON platform.support_messages      TO app_user;

-- ─── PDPA column tags ────────────────────────────────────────────────────────
-- Machine-readable in the catalogue, the way 20260816000002 tags CRM columns — an inline `--` comment
-- is invisible to anything auditing pg_description.
--
-- CONTROLLER, not processor, and the distinction is the one ADR-090 draws: a support message is
-- written TO this platform about this platform's software. Nobody else decides that it is collected.
-- That holds for the anonymous case too, where there is no tenant to be the controller at all.
COMMENT ON COLUMN platform.support_messages.body IS '@pdpa(category: "operational", role: "controller") — free text a caller writes into a support thread; may contain anything they choose to include about themselves';
COMMENT ON COLUMN platform.support_messages.sender_user_id IS '@pdpa(category: "operational", role: "controller") — traces a turn to the account that wrote it';
COMMENT ON COLUMN platform.support_tickets.opened_by IS '@pdpa(category: "operational", role: "controller") — traces a ticket to the account that opened it';
COMMENT ON COLUMN platform.support_tickets.access_token_hash IS 'SHA-256 of the one-time ticket token (spec §5.4.3) — a credential, never rendered, never logged';
