# notification

NestJS module for multi-channel notification delivery.

## Purpose

Centralised notification hub (Phase 20). All other services emit Kafka events; this module consumes them and delivers to the correct channels. No service sends notifications directly — all routing goes through here.

**Status:** Module scaffolded. Full implementation in Phase 20.

## Channels

| Channel | Technology                                                                 |
| ------- | -------------------------------------------------------------------------- |
| In-app  | SSE (Server-Sent Events) via NestJS `@Sse` decorator — NOT WebSocket       |
| Push    | Expo Push Notifications → APNs (iOS) + FCM (Android) via `expo-server-sdk` |
| Email   | SendGrid (MVP) → AWS SES (production) — EP-INFRA-004                       |
| LINE    | EP-DOMAIN-006 stub — UNSPECIFIED integration                               |

## Public API

```
GET   /api/v1/notifications                 — list my notifications (paginated)
PATCH /api/v1/notifications/:id/read        — mark as read
PATCH /api/v1/notifications/read-all        — mark all as read
GET   /api/v1/notifications/preferences     — get channel preferences
PATCH /api/v1/notifications/preferences     — update channel preferences
GET   /api/v1/notifications/stream          — SSE stream (in-app channel)
```

## Kafka Consumers (consumer group: `notification-consumer-group`)

| Event                                          | Recipients                     |
| ---------------------------------------------- | ------------------------------ |
| `site.inspection.failed.v1`                    | SITE_ENGINEER, PROJECT_MANAGER |
| `construction.issue.created.v1` (CRITICAL)     | SITE_ENGINEER, PROJECT_MANAGER |
| `procurement.purchase_order.status_changed.v1` | PROCUREMENT_OFFICER            |
| `finance.variance.alert.v1`                    | FINANCE, TENANT_ADMIN          |
| `site.report.created.v1`                       | PROJECT_MANAGER                |
| `procurement.vendor_invoice.received.v1`       | FINANCE                        |

## Dependencies

- `@cos/database` — `TenantPrismaService`
- `@cos/rbac` — auth guards
- `@cos/shared` — Kafka consumer
- `expo-server-sdk` — push notifications (APNs + FCM)
- SendGrid SDK — email (MVP)

## Configuration

| Variable            | Description                                   |
| ------------------- | --------------------------------------------- |
| `KAFKA_BROKERS`     | Kafka broker list                             |
| `SENDGRID_API_KEY`  | Injected via AWS SM / Vault                   |
| `EXPO_ACCESS_TOKEN` | Expo push token (injected via AWS SM / Vault) |

## Usage

```typescript
// Subscribe to in-app notifications (SSE)
GET / api / v1 / notifications / stream;
// Returns: event-stream with Content-Type: text/event-stream
```

## Notes

- SSE spec §19.2: WebSocket explicitly prohibited for notifications (unidirectional only)
- Direct FCM without Expo misses all iOS users — always use `expo-server-sdk`
- Template rendering: Handlebars (TypeScript equivalent of Jinja2)
- User preferences stored per `(user_id, event_type, channel)` triplet
