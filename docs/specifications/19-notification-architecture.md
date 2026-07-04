---
title: 'Notification Architecture'
version: '1.4.0'
status: Active
last_updated: '2026-06-12'
authors:
  - thitipongroo
related_docs:
  - 03-system-design.md
  - 06-rbac-permission-matrix.md
  - 15-event-driven-workflow.md
  - 16-enterprise-event-flow.md
  - 31-monitoring-observability.md
---

# 19. Notification Architecture

## Table of Contents

- [19.1 Purpose](#191-purpose)
- [19.2 Notification Channels](#192-notification-channels)
- [19.3 Notification Types](#193-notification-types)
  - [Immediate (real-time)](#immediate-real-time)
  - [Digest (scheduled)](#digest-scheduled)
  - [Escalation (threshold-triggered)](#escalation-threshold-triggered)
- [19.4 Role-to-Notification Routing](#194-role-to-notification-routing)
- [19.5 Notification Record Schema](#195-notification-record-schema)
- [19.6 Notification Preferences](#196-notification-preferences)
- [19.7 Infrastructure](#197-infrastructure)
- [19.8 Platform-Level Event Routing (Phase 25)](#198-platform-level-event-routing-phase-25)
- [19.9 Observability](#199-observability)

---

## 19.1 Purpose

The Notification Service (defined in 03-system-design section 3.2) is responsible for
delivering real-time and asynchronous alerts to users across all roles.

Notifications are triggered by events from the Event Bus (see 15-event-driven-workflow
and 16-enterprise-event-flow) and routed to recipients based on their role and project scope.

---

## 19.2 Notification Channels

| Channel       | Delivery                                     | Use Case                                                                         |
| ------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| In-app (web)  | SSE (Server-Sent Events)                     | Real-time alerts while user is active in web UI                                  |
| Push (mobile) | Expo Push Notifications (APNs / FCM)         | Alerts to field users on React Native app                                        |
| Email         | SendGrid (MVP) / AWS SES (production target) | Non-urgent summaries, daily digests, escalations                                 |
| LINE          | LINE Messaging API (push message)            | Parallel channel; tenant configures LINE Channel Access Token in tenant settings |

Implemented channel adapters (backend `notification/adapters/`): Expo Push, SendGrid (email), LINE Messaging.
SMS is present in the channel enum but has no MVP adapter — it is not included in MVP and is evaluated
post-MVP based on field user adoption data.

Note on In-app Channel :

SSE (Server-Sent Events) is used for in-app delivery because notification delivery is
unidirectional (server → client only). SSE is simpler to scale than WebSocket for this
use case and does not require persistent bidirectional session state on the server.
WebSocket is not used for notifications — bidirectional communication is not required
for alert delivery. See section 19.7 for infrastructure details.

---

## 19.3 Notification Types

### Immediate (real-time)

Delivered via in-app and push as soon as the triggering event is consumed :

- Safety incident reported
- Inspection failed
- Budget exceeded
- Delay detected
- AI risk prediction generated
- Purchase order approved / rejected
- Task assigned to user

### Digest (scheduled)

Batched and delivered via email on a schedule :

- Daily site summary (end of day — 18:00 local time)
- Weekly project cost summary (Monday 08:00)
- Weekly procurement status (Monday 08:00)

### Escalation (threshold-triggered)

Delivered when an unacknowledged immediate notification exceeds a timeout :

- Safety incident unacknowledged after 30 minutes → escalate to Project Manager
- Budget exceeded unacknowledged after 2 hours → escalate to Executive
- AI risk prediction unacknowledged after 24 hours → escalate to PM

---

## 19.4 Role-to-Notification Routing

Based on roles defined in 06-rbac-permission-matrix section 6.2. Column headers use
abbreviated display names: "PM" = Project Manager, "Procurement" = Procurement Officer,
"CRM/Sales" = CRM / Sales Manager (see §6.2 for full names and enum constants).

| Event                   | Executive | PM     | Site Engineer | Procurement | Finance | Safety Officer | CRM/Sales |
| ----------------------- | --------- | ------ | ------------- | ----------- | ------- | -------------- | --------- |
| DelayDetected           | Push      | Push   | In-app        | —           | —       | —              | —         |
| BudgetExceeded          | Push      | Push   | —             | —           | Push    | —              | —         |
| InspectionFailed        | —         | In-app | Push          | —           | —       | In-app         | —         |
| SafetyIncidentReported  | In-app    | Push   | In-app        | —           | —       | Push           | —         |
| PurchaseApproved        | —         | In-app | —             | Push        | Push    | —              | —         |
| DeliveryReceived        | —         | In-app | Push          | Push        | —       | —              | —         |
| RiskPredictionGenerated | Push      | Push   | —             | —           | —       | —              | —         |
| VendorInvoiceApproved   | —         | —      | —             | In-app      | Push    | —              | —         |
| BillingApproved         | —         | In-app | —             | —           | Push    | —              | —         |
| LeadCreated             | —         | —      | —             | —           | —       | —              | Push      |
| OpportunityConverted    | In-app    | —      | —             | —           | —       | —              | Push      |

Routing is project-scoped — a PM only receives notifications for projects they are assigned to.

---

## 19.5 Notification Record Schema

Stored in PostgreSQL for audit and in-app inbox :

- notification_id
- tenant_id
- recipient_user_id
- event_type
- event_source_id (FK to the triggering entity)
- channel (in_app / push / email / line / sms) — sms enum value has no MVP adapter (see §19.2)
- title
- body
- read_at (null = unread)
- created_at

---

## 19.6 Notification Preferences

Users can configure per-channel preferences per notification type :

- Enable / disable a notification type per channel
- Quiet hours: suppress push notifications between user-defined hours (default 22:00–07:00)
- Digest frequency: daily or weekly

Preferences are stored per user in PostgreSQL.
Critical safety notifications (SafetyIncidentReported, SafetyViolationDetected) cannot be disabled.

---

## 19.7 Infrastructure

- Notification Service subscribes to the Kafka event bus (see 15-event-driven-workflow section 15.3)
- Push delivery: Expo Push Notification Service → APNs (iOS) / FCM (Android)
- Email delivery: SendGrid (MVP) — migrates to AWS SES (with bounce/complaint handling) before production release
- In-app delivery: Server-Sent Events (SSE) endpoint per authenticated user session
- Notification records persisted to PostgreSQL before delivery — delivery is at-least-once

---

## 19.8 Platform-Level Event Routing (Phase 25)

Platform-level events (see §15.7) are emitted by Construction OS platform services, not by
tenant domain services. They are published to the shared `platform.events` Kafka topic and
consumed by the Notification Service to alert **all active SYSTEM_ADMIN users**.

These notifications are NOT project-scoped and NOT subject to quiet-hours suppression — they
represent operational platform state that SYSTEM_ADMIN must act on.

### Routing table

| Event                                    | Recipients   | In-app | Email | Push |
| ---------------------------------------- | ------------ | ------ | ----- | ---- |
| `platform.enterprise.contract_signed.v1` | SYSTEM_ADMIN | Yes    | Yes   | —    |
| `platform.enterprise.db_provisioned.v1`  | SYSTEM_ADMIN | Yes    | Yes   | —    |
| Workflow human gate (AWAITING_APPROVAL)  | SYSTEM_ADMIN | Yes    | Yes   | —    |

### Notification content

| Trigger                                  | Title                            | Body                                                                              |
| ---------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| `platform.enterprise.contract_signed.v1` | Enterprise provisioning started  | Automated DB provisioning workflow started for `{tenant_name}` (`{tenant_code}`). |
| Workflow reaches AWAITING_APPROVAL       | Data migration approval required | Dedicated DB provisioned for `{tenant_name}`. Approve or abort data migration.    |
| `platform.enterprise.db_provisioned.v1`  | Enterprise provisioning complete | Dedicated DB for `{tenant_name}` is live. Routing is active.                      |

### Implementation notes

- Recipients: query all users where `role = SYSTEM_ADMIN` at notification send time
- Event source: `platform.events` Kafka topic (not `{tenant_id}.…` scoped topics)
- Notification records: stored with `tenant_id = NULL` (platform-level, not tenant-scoped)
- The human gate notification (`AWAITING_APPROVAL`) is sent directly by
  `EnterpriseProvisioningWorkflow` via the Notification Service API — it is NOT a Kafka event

---

## 19.9 Observability

The Notification Service emits two Prometheus metrics (defined in §31.3 of
[31-monitoring-observability](31-monitoring-observability.md)):

| Metric                                   | Type      | Labels                     | Description                                           |
| ---------------------------------------- | --------- | -------------------------- | ----------------------------------------------------- |
| `notification_delivery_duration_seconds` | Histogram | channel, notification_type | Time from notification record created to delivered_at |
| `notification_pending_total`             | Gauge     | notification_type          | Count of undelivered records older than 5 min         |

### Implementation

- `notification_pending_total` is updated every 30 seconds by querying PostgreSQL:
  `WHERE delivered_at IS NULL AND created_at < NOW() - INTERVAL '5 minutes'`
  grouped by `notification_type`.
- `notification_delivery_duration_seconds` is recorded when `delivered_at` is set on
  the notification record (post-delivery callback from SSE/push/email handler).
- Both metrics are emitted via the `@cos/tracing` package (OpenTelemetry SDK).

### Alert

`SafetyNotificationFailed` fires when
`notification_pending_total{notification_type="safety"} > 0` — see §31.7 for full
alert definition and escalation policy.

---

## References

| ID           | Title                                                              | Source                                                                               |
| ------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| [IEEE 830]   | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998                                                                    |
| [FCM]        | Firebase Cloud Messaging Documentation                             | [cloud-messaging](https://firebase.google.com/docs/cloud-messaging)                  |
| [APNs]       | Apple Push Notification service Documentation                      | [usernotifications](https://developer.apple.com/documentation/usernotifications)     |
| [WebSocket]  | The WebSocket Protocol                                             | RFC 6455                                                                             |
| [SSE]        | Server-Sent Events — W3C Recommendation                            | [server-sent-events](https://html.spec.whatwg.org/multipage/server-sent-events.html) |
| [PostgreSQL] | PostgreSQL Documentation                                           | [postgresql/docs](https://www.postgresql.org/docs/)                                  |
| [Kafka]      | Apache Kafka Documentation                                         | [kafka/documentation](https://kafka.apache.org/documentation/)                       |

> 📎 See also: [03-system-design](03-system-design.md) · [06-rbac-permission-matrix](06-rbac-permission-matrix.md) · [15-event-driven-workflow](15-event-driven-workflow.md) · [16-enterprise-event-flow](16-enterprise-event-flow.md)
