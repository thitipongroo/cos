# 103: Six read routes opened to VIEWER, and seventeen deliberately left shut

**Date:** 2026-09-11
**Status:** Accepted
**Deciders:** Product Owner
**Tags:** security | api | mobile

---

## Context

`docs/specifications/06-rbac-permission-matrix.md` §6.8 grants `VIEWER` **"Procurement (all) R"** and
**"Finance (all) R"**, and has since that table was written. The routes disagreed with it.

Measured on 2026-09-11 against the running backend, with a real VIEWER token minted through
`POST /api/v1/auth/otp/verify` as the seeded demo viewer `+66811000013`:

| Endpoint                                            | Result                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /api/v1/projects/mine`                         | 200                                                                          |
| `GET /api/v1/procurement/purchase-orders`           | **403**                                                                      |
| `GET /api/v1/procurement/deliveries`                | **403**                                                                      |
| `GET /api/v1/procurement/rfqs`                      | **403**                                                                      |
| `GET /api/v1/procurement/vendors`                   | **403**                                                                      |
| `GET /api/v1/finance/cost-transactions`             | **403**                                                                      |
| `GET /api/v1/finance/budget/{projectId}`            | **403**                                                                      |
| `GET /api/v1/finance/cashflow-forecast/{projectId}` | **403**                                                                      |
| `GET /api/v1/ai/reports/procurement-summary`        | 502 — the guard PASSES (ADR-102's `ai:read`); the AI gateway was not running |

Counted the same day: **23 GET routes** across `procurement.controller.ts` and
`finance.controller.ts`, and **not one** listed VIEWER. Both controllers gate their reads through a
shared `READ_ROLES` constant — 14 routes in procurement, 10 in finance — which is why the omission
was total rather than piecemeal: the role was never in the constant.

This is not a new defect. `/procurement` and `/budget` have been VIEWER's third and fourth tabs
since 2026-08-04, which means **both tabs have been rendering screens whose every request failed for
this role since the day it got them**, silently, because each screen degrades to an empty state
rather than an error.

The same disagreement was found one day earlier on `GET /site/issues` (403 for VIEWER while §6.8
grants `Issues R`) and was recorded then as a drawn figure, `VIEWER_OPEN_ISSUES`, under ADR-099's
"missing authority rather than missing data" heading.

## Decision

**Six read routes gain `CosRole.VIEWER`. The other seventeen do not.**

| Route                                        | Read by                                                           |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `GET /procurement/purchase-orders`           | the VIEWER procurement screen's KPI tiles and its monitored lines |
| `GET /procurement/deliveries`                | its "in delivery" count                                           |
| `GET /finance/budget/{projectId}`            | the VIEWER budget screen's three summary cards                    |
| `GET /finance/cost-transactions`             | its absorption bar and BOQ disbursements                          |
| `GET /finance/cashflow-forecast/{projectId}` | its forecast card                                                 |
| `GET /site/issues`                           | the VIEWER home dashboard's open-issue tile                       |

Added at each route rather than to `READ_ROLES`: putting VIEWER in the shared constant would have
opened all 24 read routes in one edit, which is a different decision from the one taken.

`VIEWER_OPEN_ISSUES` is deleted — the tile reads the endpoint again.

## Rationale

- **The specification already said so.** `context.md` §On ambiguity: where the code and
  `docs/specifications/` disagree, the specification wins and the discrepancy is REPORTED to the
  product owner before being implemented against. It was reported on 2026-09-11 with the measurements
  above, and this is the answer.
- **Six, not twenty-three, because the answer was asked as a question.** Three options were put:
  open everything §6.8 implies, open only what the screens read, or draw the screens entirely and
  leave the routes shut. The middle one was chosen. It makes the two screens real without deciding,
  in passing, that a viewer may read vendor invoices, contracts, billing or RFQ quotations — none of
  which any screen this role can reach displays.
- **Read only.** All six are `@Get`. No POST, PATCH or DELETE route changes, and VIEWER holds no
  `:write` or `:approve` permission in `@cos/rbac` (ADR-102 kept that true when it added three
  `:read` grants).
- **Tenant isolation is unaffected.** These routes are scoped by RLS on `app.current_tenant_id` and
  by the project-membership joins the services already apply. Opening a route to a role does not
  widen the rows it returns.

### What was rejected

- **Adding VIEWER to `READ_ROLES`.** It is the smaller edit and the larger decision. Seventeen routes
  would have been opened that nothing asked for.
- **Leaving all of them shut and drawing the screens.** Offered, and declined: the two tabs would
  have kept failing silently for anything the register did not cover, and the register would have
  gained roughly forty entries whose only cause was a role list.

## Consequences

### Positive

- The two new VIEWER screens can read real data, and the third — the home dashboard's issue tile —
  stops printing a registered constant.
- The route layer and §6.8 agree for everything a VIEWER can actually reach.
- One entry leaves `mockupFigures.ts`. That register is meant to shrink.

### Negative

- **§6.8 and the routes still disagree for seventeen routes**, and that is now a deliberate,
  recorded gap rather than an unnoticed one. Anyone adding a VIEWER screen that reads vendors, RFQs,
  invoices, contracts or billing will meet the same 403 and must come back here.
- Six routes now carry a role list that differs from their neighbours', which is a thing to notice
  when reading the controller. The comment at each site says why.

### Neutral

- No migration, no schema change, no client change beyond the screens themselves.

## References

- `docs/specifications/06-rbac-permission-matrix.md` §6.8 — Viewer module permissions
- `docs/specifications/20-ux-flow.md` §20.7.9 — Viewer
- `docs/architecture/adr/102-viewer-gains-safety-analytics-ai-read.md` — the permission matrix side
  of the same disagreement, decided the day before
- `docs/architecture/adr/099-mockup-figures-without-a-data-source.md` — where `VIEWER_OPEN_ISSUES`
  was registered and is now removed
- `mockup/mobile/role_viewer/06_procurement/01_procurement`,
  `mockup/mobile/role_viewer/07_budget/01_budget`
