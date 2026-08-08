# ADR-089 — A Site Worker may submit a safety checklist, but not report an incident

- **Status:** Accepted
- **Date:** 2026-08-08
- **Deciders:** Product owner
- **Supersedes / amends:** the "UNRESOLVED SPEC CONFLICT" note in
  `backend/src/modules/sync/sync-authz.ts` (partially — see Decision)
- **Related:** `docs/specifications/06-rbac-permission-matrix.md` §6.8,
  `docs/specifications/14-api-architecture.md` §Safety APIs,
  `context/00_master_construction_os.md` §Phase 10 (SITE_WORKER workflows),
  `mockup/mobile/05_site_worker/04_safety`

## Context

Two specifications disagree about what a `SITE_WORKER` may do in the Safety module, and the
disagreement was left standing in code rather than guessed at:

- **§6.8 (RBAC permission matrix)** grants `SITE_WORKER` **RW** on Safety — which
  `packages/@cos/rbac/src/permissions.ts` implements literally (`safety:read`, `safety:write`).
- **§14 (API architecture)** lists the Safety routes as _Site Engineer, Safety Officer, Admin_ —
  which `safety.controller.ts` implements literally. `SITE_WORKER` appears in neither row.

`sync-authz.ts` recorded the contradiction verbatim and refused to resolve it, on the correct
grounds that a documentation conflict is not code drift and that widening a role by inference is
inventing policy.

It became blocking when the Site Worker safety screen
(`mockup/mobile/05_site_worker/04_safety`) was implemented: the screen's whole purpose is the
pre-shift **daily safety verification**, ending in a CONFIRM SAFETY action. Every path to persisting
that — `POST /safety/checklists` online, entity `inspection` through `/sync/push` offline — rejected
the one role the screen is drawn for. The screen could be built, but its primary action could only
ever return 403.

Master §Phase 10 independently lists the SITE_WORKER workflows as "daily report, quick issue, task
list, **safety checklist**", so the screen itself is in scope and not in question.

## Decision

**Split the Safety module by route instead of picking a winner for the whole module.**

| Surface                                   | `SITE_WORKER` | Which spec wins                                       |
| ----------------------------------------- | ------------- | ----------------------------------------------------- |
| `POST /api/v1/safety/checklists` (submit) | **allowed**   | §6.8 — the daily verification is the worker's own act |
| `GET /api/v1/safety/checklists` (read)    | allowed       | unchanged — the role was already listed               |
| `POST /api/v1/safety/incidents`           | **denied**    | §14 — unchanged                                       |
| `GET /api/v1/safety/incidents`            | denied        | §14 — unchanged                                       |
| `GET /api/v1/safety/compliance`           | denied        | §14 — unchanged                                       |

The two halves are genuinely different acts. A checklist submission is a worker attesting to their
own pre-shift state — the person doing the work is the only one who can truthfully make it, and
requiring an engineer to file it either blocks the shift or produces an attestation by someone who
was not there. An incident report is a **finding about the site**, which §14 keeps with the roles
accountable for investigating it; a worker who sees something unsafe still raises it as an **issue**
(`POST /site/issues`, where `SITE_WORKER` has always been allowed), so nothing is silenced by the
narrower half of this decision.

## Consequences

- `safety.controller.ts` — `SITE_WORKER` added to `POST safety/checklists` only.
- `sync-authz.ts` — `INSPECTION_WRITE_ROLES` **stops being an alias of** `SAFETY_WRITE_ROLES`. One
  sync entity (`inspection`) backs both `POST /site/inspections` and `POST /safety/checklists`, so
  it now carries the **union** of the two routes' roles. Had the alias been left in place, the
  incident push path would have been widened as a side effect of a decision that did not cover it —
  the exact class of silent drift that file exists to stop.
- The offline path matches the online one, so a checklist filled with no signal syncs rather than
  failing at the end of the shift (spec §17.4 lists safety checklists as offline read/write).
- §6.8 and §14 still disagree **on paper** for the incident rows. That half is deliberately left
  unresolved here rather than resolved by silence: this ADR narrows the conflict to incidents and
  records which document governs which route until a spec edit closes it.
- No migration and no data change: this is an authorization list only.

## Alternatives rejected

- **Apply §6.8 wholesale (SITE_WORKER RW on all of Safety).** Would have handed incident reporting
  and the compliance view to a role §14 excludes from both, on the strength of a coarser
  module-level matrix — widening a security boundary as a side effect of building a screen.
- **Apply §14 wholesale and drop the screen's action.** The screen would render a checklist that
  cannot be submitted by the role it is built for, and the §Phase 10 workflow would be undeliverable.
- **Leave it unresolved and make CONFIRM SAFETY an honest "not permitted" notice.** Considered and
  put to the product owner as an option; rejected because the daily verification is a real field
  routine, not a nice-to-have, and a permanently disabled primary action is a defect, not honesty.
