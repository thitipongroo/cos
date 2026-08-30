-- Rollback for 20260824000002_routed_event_notification_templates.
-- Removes the system-wide default templates seeded for the routed events. The two templates seeded
-- earlier (site.conflict.flagged.v1, site.issue.escalated.v1) and the safety-incident template from
-- 20260824000001 are deliberately NOT touched.
DELETE FROM notifications.notification_templates
WHERE tenant_id IS NULL
  AND event_type IN (
    'site.inspection.failed.v1',
    'site.issue.created.v1',
    'procurement.po.status_changed.v1',
    'finance.variance.alert.v1',
    'site.report.created.v1',
    'procurement.invoice.received.v1',
    'procurement.po.approval_requested.v1',
    'ai.risk_prediction.generated.v1',
    'file.document.quarantined.v1',
    'platform.sync.exhausted.v1',
    'platform.enterprise.contract_signed.v1',
    'platform.enterprise.db_provisioned.v1'
  );
