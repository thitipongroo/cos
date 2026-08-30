-- Phase 20 — system-default notification templates for every routed event.
--
-- NotificationService.notifyUser skips any channel with no template row (`if (!template) continue`),
-- so an event that EVENT_ROLE_MAP routes but no template covers produces ZERO notifications. Before
-- this migration 13 of the 15 routed events were in that state, including 5 of the 6 triggers the
-- Phase 20 command names outright. It stayed invisible because every unit test mocks
-- findTemplatesByChannel and the repository test queries a fabricated 'evt.v1'.
--
-- Channel choice:
--   IN_APP for the tenant-domain events — dispatch() delivers IN_APP over SSE *and* Expo push, which
--   covers both the "In-app" and "Push" cells §19.4 assigns per role. §19.4 assigns no email or LINE
--   cell to any of them; a tenant that wants those adds its own rows (tenant_id overrides NULL).
--   IN_APP + EMAIL for the two platform events — §19.8's routing table marks both Yes, Push "—".
--
-- Placeholders are the flat payload of each event's .avsc. Subject/body wording for the platform
-- events is taken verbatim from the §19.8 "Notification content" table.

INSERT INTO notifications.notification_templates
  (tenant_id, event_type, channel, subject_template, body_template, is_active)
VALUES
  -- ── §19.4 / Phase 20 command triggers ──────────────────────────────────────
  (
    NULL, 'site.inspection.failed.v1', 'IN_APP',
    'Inspection failed',
    'Inspection {{inspection_id}} on project {{project_id}} failed with {{failed_items.length}} failed item(s), inspected by {{inspected_by}} at {{inspected_at}} (checklist {{checklist_id}}).',
    true
  ),
  (
    NULL, 'site.issue.created.v1', 'IN_APP',
    'New issue raised ({{severity}})',
    'Issue "{{title}}" ({{severity}}) was raised on project {{project_id}} by {{created_by}} (issue {{issue_id}}).',
    true
  ),
  (
    NULL, 'procurement.po.status_changed.v1', 'IN_APP',
    'Purchase order status changed',
    'Purchase order {{po_id}} moved from {{from_status}} to {{to_status}}.',
    true
  ),
  (
    NULL, 'finance.variance.alert.v1', 'IN_APP',
    'Budget variance alert ({{variance_percentage}}%)',
    'Project {{project_id}} crossed the {{threshold_exceeded}} budget threshold — variance {{variance_percentage}}%. Actual {{actual_amount}} {{currency_code}}, committed {{committed_amount}}, allocated {{allocated_amount}} (budget {{budget_id}}).',
    true
  ),
  (
    NULL, 'site.report.created.v1', 'IN_APP',
    'Daily site report submitted',
    'A site report for {{report_date}} on project {{project_id}} was submitted by {{submitted_by}}: {{summary}} ({{issue_count}} issue(s), {{photo_count}} photo(s); report {{report_id}}).',
    true
  ),
  (
    NULL, 'procurement.invoice.received.v1', 'IN_APP',
    'Vendor invoice received',
    'Invoice {{invoice_id}} for {{amount.amount}} {{amount.currency_code}} was received from vendor {{vendor_id}} against purchase order {{po_id}} on project {{project_id}} (invoiced {{invoice_date}}, due {{due_date}}).',
    true
  ),

  -- ── §19.4 routing rows added by earlier phases ─────────────────────────────
  (
    NULL, 'procurement.po.approval_requested.v1', 'IN_APP',
    'Purchase order {{po_number}} needs your approval',
    'Purchase order {{po_number}} for {{total_amount}} {{currency_code}} on project {{project_id}} is awaiting your tier {{tier}} approval (purchase order {{po_id}}).',
    true
  ),
  (
    NULL, 'ai.risk_prediction.generated.v1', 'IN_APP',
    'AI risk prediction generated',
    'A {{model_type}} risk prediction for project {{project_id}}: {{prediction}} (confidence {{confidence}}, model {{model_version}}, generated {{generated_at}}; prediction {{prediction_id}}).',
    true
  ),

  -- ── Phase 9 / Phase 10 operational alerts ──────────────────────────────────
  (
    NULL, 'file.document.quarantined.v1', 'IN_APP',
    'File quarantined by malware scan',
    'File {{file_id}} was quarantined by the malware scanner{{#if threat_type}} ({{threat_type}}){{/if}} and is not downloadable.',
    true
  ),
  (
    NULL, 'platform.sync.exhausted.v1', 'IN_APP',
    'Offline sync gave up on a {{entity_type}} change',
    'A {{operation}} on {{entity_type}} {{entity_id}} from device {{client_id}} failed {{retry_count}} time(s) and was moved to the admin review queue (item {{item_id}}).',
    true
  ),

  -- ── §19.8 platform-level events (In-app + Email, wording per §19.8) ─────────
  (
    NULL, 'platform.enterprise.contract_signed.v1', 'IN_APP',
    'Enterprise provisioning started',
    'Automated DB provisioning workflow started for {{tenant_name}} ({{tenant_code}}).',
    true
  ),
  (
    NULL, 'platform.enterprise.contract_signed.v1', 'EMAIL',
    'Enterprise provisioning started',
    'Automated DB provisioning workflow started for {{tenant_name}} ({{tenant_code}}).',
    true
  ),
  (
    NULL, 'platform.enterprise.db_provisioned.v1', 'IN_APP',
    'Enterprise provisioning complete',
    'Dedicated DB for {{tenant_name}} is live. Routing is active.',
    true
  ),
  (
    NULL, 'platform.enterprise.db_provisioned.v1', 'EMAIL',
    'Enterprise provisioning complete',
    'Dedicated DB for {{tenant_name}} is live. Routing is active.',
    true
  )
ON CONFLICT (tenant_id, event_type, channel) DO NOTHING;
