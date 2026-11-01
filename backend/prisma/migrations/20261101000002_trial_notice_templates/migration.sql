-- Notification templates for the free-trial notices (spec §7.10, ADR-109).
--
-- Sent by the daily trial job (TrialLifecycleService) through NotificationService — not Kafka events, so the
-- event_type is only the template key (TRIAL_NOTICE_EVENT_TYPES in modules/notification/public/event-types.ts).
--
-- CHANNELS. §7.10: the tenant notices go by email and by LINE where the user has linked LINE — EMAIL and LINE rows,
-- no IN_APP. The day-60 notice to SYSTEM_ADMIN is IN_APP + EMAIL, like the provisioning gate (§19.8).
--
-- LANGUAGE (QM-3). platform.users has no locale, and these go to a customer's administrators before anyone has
-- chosen one, so each body is Thai, a blank line, then English. Subjects carry both, separated by " / ".
--
-- WORDING follows the commitments published on construction-os.io (/terms, /trial): nothing is charged
-- automatically; after the trial the account is read-only for 30 days, viewable and exportable, then deleted. No
-- feature is named that the product does not have.
--
-- Placeholders the job supplies: tenant_name, tenant_code, plan_name, trial_ends_on_th / _en and
-- deletion_on_th / _en (dates already formatted in the tenant's timezone).
--
-- NOT EXISTS rather than ON CONFLICT: tenant_id is NULL for a system template and NULLs are distinct
-- (20260831000001 explains). Backward-compatible (QM-9): new rows only.
--
-- Rollback: rollbacks/20261101000002_trial_notice_templates.rollback.sql

INSERT INTO notifications.notification_templates
  (tenant_id, event_type, channel, subject_template, body_template, is_active)
SELECT v.tenant_id, v.event_type, v.channel::notifications."NotificationChannel",
       v.subject_template, v.body_template, true
FROM (VALUES
  (NULL::uuid, 'tenant.trial.notice.day_0', 'EMAIL',
   'ยินดีต้อนรับสู่ Construction OS — เริ่มทดลองใช้ฟรี 30 วัน / Welcome — your 30-day free trial has started',
   'เริ่มทดลองใช้ Construction OS สำหรับ {{tenant_name}} แล้ว แพ็กเกจ {{plan_name}} ใช้งานได้ถึงวันที่ {{trial_ends_on_th}} ไม่มีการตัดเงินอัตโนมัติเมื่อครบกำหนด

Your Construction OS trial for {{tenant_name}} has started on the {{plan_name}} plan and runs until {{trial_ends_on_en}}. Nothing is charged automatically when it ends.'),
  (NULL::uuid, 'tenant.trial.notice.day_0', 'LINE',
   'ยินดีต้อนรับสู่ Construction OS — เริ่มทดลองใช้ฟรี 30 วัน / Welcome — your 30-day free trial has started',
   'เริ่มทดลองใช้ Construction OS สำหรับ {{tenant_name}} แล้ว แพ็กเกจ {{plan_name}} ใช้งานได้ถึงวันที่ {{trial_ends_on_th}} ไม่มีการตัดเงินอัตโนมัติเมื่อครบกำหนด

Your Construction OS trial for {{tenant_name}} has started on the {{plan_name}} plan and runs until {{trial_ends_on_en}}. Nothing is charged automatically when it ends.'),
  (NULL::uuid, 'tenant.trial.notice.day_7', 'EMAIL',
   'ทดลองใช้ครบ 1 สัปดาห์ / One week into your trial',
   'ทดลองใช้มาครบ 1 สัปดาห์แล้ว ลองสร้างโครงการแรกและเชิญทีมงานเข้าร่วม เพื่อดูการทำงานกับข้อมูลจริงของ {{tenant_name}} ช่วงทดลองใช้สิ้นสุดวันที่ {{trial_ends_on_th}}

You are one week into your trial. Create your first project and invite your team to see it working with {{tenant_name}}''s own data. The trial ends on {{trial_ends_on_en}}.'),
  (NULL::uuid, 'tenant.trial.notice.day_7', 'LINE',
   'ทดลองใช้ครบ 1 สัปดาห์ / One week into your trial',
   'ทดลองใช้มาครบ 1 สัปดาห์แล้ว ลองสร้างโครงการแรกและเชิญทีมงานเข้าร่วม เพื่อดูการทำงานกับข้อมูลจริงของ {{tenant_name}} ช่วงทดลองใช้สิ้นสุดวันที่ {{trial_ends_on_th}}

You are one week into your trial. Create your first project and invite your team to see it working with {{tenant_name}}''s own data. The trial ends on {{trial_ends_on_en}}.'),
  (NULL::uuid, 'tenant.trial.notice.day_21', 'EMAIL',
   'เหลือเวลาทดลองใช้ 9 วัน / 9 days left in your trial',
   'ช่วงทดลองใช้ของ {{tenant_name}} เหลืออีก 9 วัน สิ้นสุดวันที่ {{trial_ends_on_th}} ติดต่อทีมงานเพื่อเลือกแพ็กเกจได้ตลอดเวลา

{{tenant_name}} has 9 days left in its trial, which ends on {{trial_ends_on_en}}. Contact our team any time to choose a plan.'),
  (NULL::uuid, 'tenant.trial.notice.day_21', 'LINE',
   'เหลือเวลาทดลองใช้ 9 วัน / 9 days left in your trial',
   'ช่วงทดลองใช้ของ {{tenant_name}} เหลืออีก 9 วัน สิ้นสุดวันที่ {{trial_ends_on_th}} ติดต่อทีมงานเพื่อเลือกแพ็กเกจได้ตลอดเวลา

{{tenant_name}} has 9 days left in its trial, which ends on {{trial_ends_on_en}}. Contact our team any time to choose a plan.'),
  (NULL::uuid, 'tenant.trial.notice.day_28', 'EMAIL',
   'เหลือเวลาทดลองใช้ 2 วัน / 2 days left in your trial',
   'ช่วงทดลองใช้ของ {{tenant_name}} สิ้นสุดวันที่ {{trial_ends_on_th}} หลังจากนั้นบัญชีจะเป็นแบบอ่านอย่างเดียว 30 วัน ดูและส่งออกข้อมูลได้แต่แก้ไขไม่ได้ จากนั้นข้อมูลจะถูกลบ ไม่มีการตัดเงินอัตโนมัติ

{{tenant_name}}''s trial ends on {{trial_ends_on_en}}. After that the account is read-only for 30 days — you can view and export your data but not change it — and the data is then deleted. Nothing is charged automatically.'),
  (NULL::uuid, 'tenant.trial.notice.day_28', 'LINE',
   'เหลือเวลาทดลองใช้ 2 วัน / 2 days left in your trial',
   'ช่วงทดลองใช้ของ {{tenant_name}} สิ้นสุดวันที่ {{trial_ends_on_th}} หลังจากนั้นบัญชีจะเป็นแบบอ่านอย่างเดียว 30 วัน ดูและส่งออกข้อมูลได้แต่แก้ไขไม่ได้ จากนั้นข้อมูลจะถูกลบ ไม่มีการตัดเงินอัตโนมัติ

{{tenant_name}}''s trial ends on {{trial_ends_on_en}}. After that the account is read-only for 30 days — you can view and export your data but not change it — and the data is then deleted. Nothing is charged automatically.'),
  (NULL::uuid, 'tenant.trial.notice.day_30', 'EMAIL',
   'ช่วงทดลองใช้สิ้นสุดแล้ว — บัญชีเป็นแบบอ่านอย่างเดียว / Your trial has ended — the account is now read-only',
   'ช่วงทดลองใช้ของ {{tenant_name}} สิ้นสุดแล้ว บัญชีเป็นแบบอ่านอย่างเดียวถึงวันที่ {{deletion_on_th}} ยังดูและส่งออกข้อมูลได้ เลือกแพ็กเกจเพื่อใช้งานต่อโดยข้อมูลยังอยู่ครบ

{{tenant_name}}''s trial has ended. The account is read-only until {{deletion_on_en}}; you can still view and export your data. Choose a plan to carry on with all of it intact.'),
  (NULL::uuid, 'tenant.trial.notice.day_30', 'LINE',
   'ช่วงทดลองใช้สิ้นสุดแล้ว — บัญชีเป็นแบบอ่านอย่างเดียว / Your trial has ended — the account is now read-only',
   'ช่วงทดลองใช้ของ {{tenant_name}} สิ้นสุดแล้ว บัญชีเป็นแบบอ่านอย่างเดียวถึงวันที่ {{deletion_on_th}} ยังดูและส่งออกข้อมูลได้ เลือกแพ็กเกจเพื่อใช้งานต่อโดยข้อมูลยังอยู่ครบ

{{tenant_name}}''s trial has ended. The account is read-only until {{deletion_on_en}}; you can still view and export your data. Choose a plan to carry on with all of it intact.'),
  (NULL::uuid, 'tenant.trial.notice.day_53', 'EMAIL',
   'อีก 7 วันข้อมูลจะถูกลบ / Your data will be deleted in 7 days',
   'ข้อมูลของ {{tenant_name}} จะถูกลบหลังวันที่ {{deletion_on_th}} หากต้องการเก็บไว้ โปรดส่งออกข้อมูลหรือเลือกแพ็กเกจก่อนวันดังกล่าว

{{tenant_name}}''s data will be deleted after {{deletion_on_en}}. To keep it, export it or choose a plan before then.'),
  (NULL::uuid, 'tenant.trial.notice.day_53', 'LINE',
   'อีก 7 วันข้อมูลจะถูกลบ / Your data will be deleted in 7 days',
   'ข้อมูลของ {{tenant_name}} จะถูกลบหลังวันที่ {{deletion_on_th}} หากต้องการเก็บไว้ โปรดส่งออกข้อมูลหรือเลือกแพ็กเกจก่อนวันดังกล่าว

{{tenant_name}}''s data will be deleted after {{deletion_on_en}}. To keep it, export it or choose a plan before then.'),
  (NULL::uuid, 'tenant.trial.notice.day_60_admin', 'IN_APP',
   'ผู้เช่าทดลองใช้ถึงกำหนดลบ / Trial tenant due for deletion',
   'ผู้เช่า {{tenant_code}} ({{tenant_name}}) ถึงกำหนดลบข้อมูลแล้ว ช่วงทดลองใช้สิ้นสุดวันที่ {{trial_ends_on_th}} ดำเนินการตาม docs/runbooks/trial-tenant-deletion.md

Tenant {{tenant_code}} ({{tenant_name}}) is due for deletion; its trial ended on {{trial_ends_on_en}}. Follow docs/runbooks/trial-tenant-deletion.md.'),
  (NULL::uuid, 'tenant.trial.notice.day_60_admin', 'EMAIL',
   'ผู้เช่าทดลองใช้ถึงกำหนดลบ / Trial tenant due for deletion',
   'ผู้เช่า {{tenant_code}} ({{tenant_name}}) ถึงกำหนดลบข้อมูลแล้ว ช่วงทดลองใช้สิ้นสุดวันที่ {{trial_ends_on_th}} ดำเนินการตาม docs/runbooks/trial-tenant-deletion.md

Tenant {{tenant_code}} ({{tenant_name}}) is due for deletion; its trial ended on {{trial_ends_on_en}}. Follow docs/runbooks/trial-tenant-deletion.md.')
) AS v (tenant_id, event_type, channel, subject_template, body_template)
WHERE NOT EXISTS (
  SELECT 1 FROM notifications.notification_templates t
   WHERE t.tenant_id IS NULL AND t.event_type = v.event_type
     AND t.channel = v.channel::notifications."NotificationChannel"
);
