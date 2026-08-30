-- Restore system-default template visibility under app_user.
--
-- WHAT WAS BROKEN
-- ---------------
-- notification_templates.tenant_id is NULLABLE by design: "null tenant_id = system-wide default
-- template; tenant-specific templates override" (20260605000003), and its original policy said so —
--   USING (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
-- (20260605000004, comment: "policy allows both").
--
-- 20260623000002_consolidate_rls_single_permissive then normalized EVERY table in the database to one
-- canonical policy, `tenant_id = NULLIF(current_setting(...), '')::uuid`. That sweep is right for the
-- tables it was written for — all of which have NOT NULL tenant_id — but it dropped the IS NULL arm
-- here. `NULL = <uuid>` is NULL, never true, so under app_user every system-default template became
-- invisible.
--
-- The consequence was total and silent: NotificationService.notifyUser skips a channel when the
-- template lookup returns nothing, and the lookup runs through NotificationPrismaService, which
-- connects as app_user. Every notification in the product — safety incidents included — was being
-- dropped at that line. Nothing caught it: the unit tests mock findTemplatesByChannel, and the
-- integration harness connects as the container superuser, which bypasses RLS entirely.
--
-- THE FORM RESTORED HERE
-- ----------------------
-- USING keeps the canonical NULLIF hardening and adds back the IS NULL arm, so app_user reads system
-- defaults plus its own tenant's overrides and nothing else.
-- WITH CHECK deliberately does NOT include the IS NULL arm: app_user may write only rows carrying its
-- own tenant_id, so a tenant cannot create or edit a system-wide template. Seeding those stays with
-- migrations, which run as the owner.
--
-- Backward compatible (QM-9): widening on read, unchanged on write. Nothing that worked before stops
-- working — the owner/superuser path bypasses RLS either way.
-- Rollback: prisma/rollbacks/20260824000003_notification_templates_system_default_rls.rollback.sql

DROP POLICY IF EXISTS rls_tenant_isolation ON notifications.notification_templates;
DROP POLICY IF EXISTS tenant_isolation     ON notifications.notification_templates;

CREATE POLICY rls_tenant_isolation ON notifications.notification_templates
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (
    tenant_id IS NULL
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
  );
