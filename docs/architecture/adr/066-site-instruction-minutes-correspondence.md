# 66. Site instruction / meeting minutes / correspondence log — post-MVP, Project service

Date: 2026-07-20

## Status

Accepted

## Context

ADR-057 recorded site instructions, meeting minutes, and a correspondence log as a post-MVP gap. RFIs
already exist as a `Task` (`work_type: rfi`), but there is no document-control record for instructions,
minutes, or correspondence. The product owner requested the full design; it remains **post-MVP**.

Product-owner decisions (2026-07-20):

- **Model:** One unified entity with a `record_type`.
- **Host:** Project service (`projects` schema), project-scoped.
- **Action items:** A trackable sub-entity (owner + due + status) on meeting minutes.
- **Ownership:** PM + Site Engineer create; all roles read.

## Decision

### Data model (§11, `projects` schema)

**`CommunicationRecord`** — `record_id` (PK), `tenant_id`, `project_id` (FK), `record_type`
ENUM(`SITE_INSTRUCTION` / `MEETING_MINUTES` / `CORRESPONDENCE`), `title`, `body`, `record_date`,
`linked_task_id` (nullable — e.g. a related RFI/task), `created_by`, `created_at`.

**`ActionItem`** — `action_id` (PK), `tenant_id`, `record_id` (FK → CommunicationRecord), `description`,
`owner` (user_id), `due_date`, `status` ENUM(`OPEN` / `DONE`), `created_at`.

### Behaviour

- One register covers site instructions, meeting minutes, and correspondence, distinguished by
  `record_type`. Meeting minutes carry `ActionItem`s that are tracked to completion.
- `linked_task_id` ties a record to a related RFI/task where relevant.

### API (§14, `/api/v1/projects`)

- `GET /{id}/communications` (list; `?type`) · `POST /{id}/communications` (create)
- `GET /{id}/communications/{recordId}/actions` · `POST /{id}/communications/{recordId}/actions`
- `PATCH /{id}/communications/{recordId}/actions/{actionId}` (OPEN/DONE)

### RBAC (§6)

Communications / document-control: `PROJECT_MANAGER` = RW, `SITE_ENGINEER` = RW, other roles = R,
`TENANT_ADMIN` = FULL.

### Events (§15/§16)

`CommunicationRecorded`, `ActionItemAssigned`, `ActionItemCompleted`.

### UX (§20)

- `/projects/{id}/communications` — site instructions / minutes / correspondence register + action-item
  tracker.

## Consequences

### Positive

- A single, simple document-control register; action items make minutes actionable, not just notes.
- Complements the existing RFI-as-Task without duplicating it (`linked_task_id`).

### Negative / open

- Not a full DMS (versioned documents / drawings) — that is the separate post-MVP Document management gap
  (§4, ADR-057 list).

### Neutral

- **Remains post-MVP.**

## References

- ADR-057 (gap) · §11 `projects` schema · RFI-as-Task (`work_type: rfi`, §11/§20)
