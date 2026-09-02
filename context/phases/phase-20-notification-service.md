# Phase 20 — Notification Service

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 2, 3 · SaaS Maturity Stage —.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build Notification Service.

Purpose: centralized multi-channel notification delivery for all services.
All other services emit events → Notification Service consumes and delivers.
No service should send notifications directly — route through this service only.

Channels (source: spec §19.2):
  In-app:  SSE (Server-Sent Events) per authenticated user session — NOT WebSocket;
           spec §19.2 explicitly prohibits WebSocket for notifications (unidirectional only)
  Push:    Expo Push Notifications → APNs (iOS) + FCM (Android) — NOT direct FCM;
           direct FCM misses all iOS users; use expo-server-sdk on the backend
  Email:   SendGrid (MVP), AWS SES (production with bounce/complaint handling);
           implement SendGrid adapter in Phase 20; SES migration before Stage 2 go-live (spec §19.7)
  LINE:    LINE Messaging API (push message);
           tenant configures LINE Channel Access Token in tenant settings;
           parallel channel alongside FCM/APNs
  SMS:     DELETED — removed (LINE, WhatsApp, Slack, Teams, Telegram,
           Discord cover all MVP notification channels)

Notification triggers (consumed from Kafka — canonical event names per spec §32.4):
  site.inspection.failed.v1                 → notify: SITE_ENGINEER, PROJECT_MANAGER
  site.issue.created.v1 (CRITICAL)           → notify: SITE_ENGINEER, PROJECT_MANAGER
  procurement.po.status_changed.v1             → notify: PROCUREMENT_OFFICER (actor)
  finance.variance.alert.v1                 → notify: FINANCE, TENANT_ADMIN
  site.report.created.v1                    → notify: PROJECT_MANAGER (spec §32.4 #5; corrected from construction.site_report.submitted.v1)
  procurement.invoice.received.v1           → notify: FINANCE

Entities (PostgreSQL — schema: notifications):
  notification_templates:
    template_id     UUID PK
    tenant_id       UUID  (nullable — null = system template)
    event_type      VARCHAR(255) NOT NULL  — maps to Kafka event_type
    channel         ENUM('IN_APP','EMAIL','LINE','PUSH','SMS')  -- PUSH = Expo push (mobile); SMS enum value has no MVP adapter (spec §19.2)
    subject_template TEXT    — Jinja2 template
    body_template   TEXT NOT NULL  — Jinja2 template
    is_active       BOOLEAN DEFAULT true

  notifications:
    notification_id UUID PK
    tenant_id       UUID NOT NULL
    recipient_id    UUID NOT NULL   — user_id
    channel         ENUM('IN_APP','EMAIL','LINE','PUSH','SMS')  -- PUSH = Expo push (mobile); SMS enum value has no MVP adapter (spec §19.2)
    event_type      VARCHAR(255) NOT NULL
    subject         TEXT
    body            TEXT NOT NULL
    status          ENUM('PENDING','SENT','FAILED','READ')
    sent_at         TIMESTAMPTZ
    read_at         TIMESTAMPTZ
    created_at      TIMESTAMPTZ DEFAULT now()
    INDEX: (tenant_id, recipient_id, status)

  notification_preferences:
    pref_id         UUID PK
    tenant_id       UUID NOT NULL
    user_id         UUID NOT NULL
    event_type      VARCHAR(255) NOT NULL
    channel         ENUM('IN_APP','EMAIL','LINE','PUSH','SMS')  -- PUSH = Expo push (mobile); SMS enum value has no MVP adapter (spec §19.2)
    is_enabled      BOOLEAN DEFAULT true
    quiet_hours_start TIME DEFAULT '22:00'  -- spec §19.6; per-user quiet window
    quiet_hours_end   TIME DEFAULT '07:00'
    UNIQUE: (user_id, event_type, channel)

  Delivery rules (spec §19.3 / §19.6):
  - Quiet hours (§19.6): suppress non-critical delivery 22:00–07:00 (user local tz);
    **critical safety notifications cannot be disabled or quieted** — always delivered.
  - Digest (§19.3): batch non-urgent notifications into a daily digest at 18:00 and a
    weekly digest Monday 08:00 (tenant timezone).
  - Escalation timeouts (§19.3) — distinct from the §15.5 48h *approval* escalation:
      * safety incident unacknowledged 30 min → escalate to PM
      * budget alert unacknowledged 2 h → escalate to Executive
      * AI risk prediction unacknowledged 24 h → escalate to PM

APIs:
  GET  /api/v1/notifications                  — list my notifications (paginated)
  PATCH /api/v1/notifications/:id/read        — mark as read
  PATCH /api/v1/notifications/read-all        — mark all as read
  GET  /api/v1/notifications/preferences      — get my channel preferences
  PATCH /api/v1/notifications/preferences     — update channel preferences

Generate:

- NestJS module with Kafka consumer group: notification.shared (shared-cluster naming {service}.shared, §7.3); subscribes per-tenant topics via RegExp + validates tenant_id header
- Template rendering service (Jinja2-style via handlebars in TypeScript)
- SSE (Server-Sent Events) endpoint per authenticated user session (NestJS @Sse decorator) —
  NOT Socket.IO; spec §19.2: "SSE is used for in-app delivery; WebSocket is not used for notifications"
- Expo Push Notifications integration via expo-server-sdk (routes to APNs for iOS + FCM for Android) —
  NOT direct firebase-admin FCM; direct FCM misses all iOS users (spec §19.2)
- Email: SendGrid adapter for MVP, migrate to AWS SES before production (spec §19.7)
- LINE: LINE Messaging API push message; tenant configures LINE Channel Access Token in tenant settings
- SMS: not included in MVP (LINE, WhatsApp, Slack, Teams, Telegram, Discord cover MVP notification needs)
- PostgreSQL migration files
- OpenAPI 3.1 spec
- Unit tests: template rendering, consumer routing, preference filtering
- Integration tests: end-to-end event → notification delivery


Constraints:

- Before marking Phase 20 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```
