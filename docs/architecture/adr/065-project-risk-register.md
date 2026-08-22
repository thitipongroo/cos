# 65. Project risk register — post-MVP, Project service

Date: 2026-07-20

## Status

Accepted

**Implementation note (2026-07-25, corrected 2026-08-22):** the register itself —
`projects.project_risk`, the four `/projects/{id}/risks` endpoints, RBAC, and the `RiskRaised` /
`RiskStatusChanged` events — was pulled forward and built by product-owner decision.

The two items this note listed as remaining follow-ups are **both built as well**, and the note was
simply never updated (TDD OQ-20):

- **AI-suggested feed** — `RisksConsumer` subscribes to `ai.risk_prediction.generated.v1`, maps the
  forecast through `ai-risk-mapping.ts`, and `RisksService` writes the risk with
  `source = 'AI_SUGGESTED'` and a system actor (`risks.service.ts`). It is registered as a provider
  in `project.module.ts`, so it runs.
- **Web UX** — `apps/web/src/components/project/RiskHeatMap.tsx`, rendered by
  `app/(app)/projects/[id]/risks/page.tsx`.

Nothing about this ADR's Decision changes; only the status of its follow-ups.

## Context

ADR-057 recorded a project risk register as a post-MVP gap. AI delay-risk forecasting exists (Layer B,
post-MVP) but there is no structured, human-owned risk register. The product owner requested the full
design; it remains **post-MVP**.

Product-owner decisions (2026-07-20):

- **Scoring:** Full likelihood × impact (risk_score) + category + mitigation + owner + status.
- **Host:** Project service (`projects` schema), project-scoped.
- **AI link:** Manual register + AI-suggested risks may feed in (when Layer B is available).
- **Ownership:** PM manages; Site Engineer can raise; Executive views.

## Decision

### Data model (§11, `projects` schema)

**`ProjectRisk`** — `risk_id` (PK), `tenant_id`, `project_id` (FK), `title`, `description`, `category`
ENUM(`SAFETY` / `FINANCIAL` / `SCHEDULE` / `TECHNICAL` / `EXTERNAL` / `OTHER`), `likelihood` (1–5),
`impact` (1–5), `risk_score` (= likelihood × impact), `mitigation`, `owner` (user_id), `status`
ENUM(`OPEN` / `MITIGATING` / `CLOSED` / `ACCEPTED`), `source` ENUM(`MANUAL` / `AI_SUGGESTED`),
`created_by`, `created_at`.

### Behaviour

- `risk_score` = `likelihood × impact` (1–25) drives a heat-map severity band.
- The Layer B AI delay-risk model (post-MVP) may create `source = AI_SUGGESTED` risks for human triage;
  humans own acceptance/mitigation. Manual entry is the baseline.

### API (§14, `/api/v1/projects`)

- `GET /{id}/risks` (list; `?status` / `?category`) · `POST /{id}/risks` (raise)
- `PATCH /{id}/risks/{riskId}` (edit) · `PATCH /{id}/risks/{riskId}/status`

### RBAC (§6)

Risk register: `PROJECT_MANAGER` = RW, `SITE_ENGINEER` = RW (raise), `EXECUTIVE` = R, `TENANT_ADMIN` = FULL.

### Events (§15/§16)

`RiskRaised`, `RiskStatusChanged`.

### UX (§20)

- `/projects/{id}/risks` — risk register + likelihood×impact heat map; raise / mitigate / close.

## Consequences

### Positive

- Gives the AI delay-risk forecast a human-owned home; distinguishes AI-suggested from accepted risk.
- Simple 5×5 scoring — no external methodology dependency.

### Negative / open

- The AI-suggested feed depends on Layer B being deployed (post-MVP); until then the register is manual.

### Neutral

- **Remains post-MVP.**

## References

- ADR-057 (gap) · §22 AI delay-risk (Layer B) · §11 `projects` schema
