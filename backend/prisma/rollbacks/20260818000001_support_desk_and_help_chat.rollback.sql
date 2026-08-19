-- Rollback: 20260818000001_support_desk_and_help_chat
--
-- DESTRUCTIVE, and the two halves lose different things.
--
-- THE DESK is configuration. Dropping it returns the product to where it was on 2026-08-17: the two
-- EXPO_PUBLIC_SUPPORT_* variables are the only numbers, there are no operating hours and no regional
-- list, and the hotline detail screen has nothing to render. Whatever a deployment or a tenant typed
-- into those columns is gone — export platform.support_desk_default and platform.tenant_support_desks
-- before running this if any deployment has configured them.
--
-- THE CHAT is a record of what people asked and what they were told, including turns an AI produced
-- under §22.3. Dropping support_messages destroys the evidence that a low-confidence answer WAS
-- labelled low-confidence — the audit log records that a message was created, not what it said. Any
-- ticket still OPEN, AI_HANDLING or ESCALATED is a person waiting for a reply, and this script does
-- not tell them. Export both tables first.
--
-- ANONYMOUS TICKETS CANNOT BE RECONSTRUCTED. The access token was returned once and only its SHA-256
-- was ever stored, so a restored row is unreachable by the caller who opened it even if the table
-- comes back.
--
-- Nothing in the migration was destructive to begin with (new types, new tables, new grants, one
-- seeded row), so the reverse is a clean drop with nothing to restore elsewhere. The grants and the
-- RLS policies go with their tables; the COMMENT ON COLUMN tags go with their columns.
--
-- Drop order: messages before tickets (FK), then the desk tables, then the enum types, which nothing
-- else references. The RLS helper function goes last — it is referenced by the support_messages
-- policies, so it cannot be dropped while that table is still standing.

DROP TABLE IF EXISTS platform.support_messages;

DROP TABLE IF EXISTS platform.support_tickets;

DROP TABLE IF EXISTS platform.tenant_support_desks;

DROP TABLE IF EXISTS platform.support_desk_default;

DROP TYPE IF EXISTS platform."SupportMessageSender";

DROP TYPE IF EXISTS platform."SupportTicketStatus";

DROP FUNCTION IF EXISTS platform.current_anonymous_ticket();
