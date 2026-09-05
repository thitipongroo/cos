# ADR-099: The EXECUTIVE screens print the mockup's own figures where the platform has no source

**Date:** 2026-09-05
**Status:** Accepted
**Deciders:** Product Owner
**Tags:** mobile | data

---

## Context

Ten figures in `mockup/mobile/08_executive/` have no source in this platform. They were each checked
against the schema and the API before this record was written, not assumed:

| Figure                                                     | Why it cannot be computed                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `92%` compliance, grade `A`, `+2.4% vs last month`         | `GET /safety/compliance` returns FOUR COUNTS and no percentage — `ComplianceSummary` is `open_incidents`, `high_critical_incidents`, `expired_permits`, `revoked_permits`. No compliance score exists anywhere in the product.                      |
| `Safe Man-Hours 1.2M`                                      | Attendance carries `hours_worked`, but "safe hours since the last lost-time injury" is nowhere computed and no column marks an LTI.                                                                                                                 |
| The 6-month compliance trend chart                         | Follows from the score above: no score, no series. `analytics.site_activity_daily` holds reports, issues, inspection failures and manpower — not compliance.                                                                                        |
| Project safety score `96/100`, `SECURE` / `MONITOR`        | Same missing score, per project.                                                                                                                                                                                                                    |
| `+2 this month` (project-count delta)                      | No historical series of project counts exists.                                                                                                                                                                                                      |
| Per-project `Sync Status` chip                             | Sync state is per queue and per device, not per project.                                                                                                                                                                                            |
| `Project Locations` map, "Southeast Asia Sector"           | `schema.prisma` has no latitude or longitude on a project. The seed's coordinates land on site reports, issues, incidents and attendance — never on the project — and `apps/mobile/package.json` carries no maps library (`react-native-svg` only). |
| `CONF: 94%` on the Home KPI card                           | That card is not an AI output. The AI panels beside it print the model's own confidence; this number would be a confidence in nothing.                                                                                                              |
| The `Filter` control on the project list                   | No filter criteria are specified for it.                                                                                                                                                                                                            |
| Tiles: strategic BIM · carbon accounting · global site map | BIM is a Type A stub (§32.9). Carbon has a ClickHouse table but `carbon-calculation.stub.ts` throws `NotImplementedException` and no controller exposes it. The map is the coordinate problem above.                                                |

The repository already had a settled treatment for this. ADR-085 makes mockups authoritative for
**style** and not for **data that does not exist**; the product-owner ruling of 2026-08-13 (recorded
in `context/phases/phase-10-mobile-offline-engine.md`) drew four such Safety Officer panels and
stated on each that it was not available; `more.tsx` does the same for four of its six tiles.

That treatment was put to the product owner for these ten, with the conflict named, and **the
decision went the other way.**

## Decision

**The screens print the mockup's own numbers** — `92%`, `1.2M`, `96/100`, `+2 this month` and the
rest — as drawn.

Three obligations come with it, and they are the whole reason this record exists:

1. **Every such value lives in one module**, `apps/mobile/src/lib/mockupFigures.ts`, whose header
   states what it is. A reader who greps that module sees the complete set; deleting the module is
   how the decision is reversed, and nothing else has to be found first.
2. **No such value may be presented as an AI output.** The AI panels on these screens call the real
   endpoints and print the model's own text and its own confidence. A fabricated confidence beside a
   real one is the specific failure §22.3 is most explicit about.
3. **`docs/screens/README.md` and `docs/screens/android/README.md` are amended.** Both currently
   say the captures are made "against the local backend with seeded demo data — real logins and
   live API calls, not mockups". Left alone, that sentence becomes false the moment these screens
   are photographed, and a false provenance note is worse than none: it is the line a reviewer uses
   to decide whether a number can be trusted.

## Rationale

The case against was put before the decision and is recorded here rather than softened: this
contradicts ADR-085, it puts figures on screen that no query produced, and the captures in
`docs/screens/` become a mixture of real and drawn values within a single image.

The case for is that the drawings are the specification of what this role's app should look like,
and a screen where six of nine panels read "not available yet" does not communicate the design. The
product owner is entitled to make that trade for a product not yet in front of customers.

What makes it recoverable rather than permanent is obligation 1. The 2026-08-13 treatment scattered
its "not available" notes across the screens that needed them, which is right when the notes are the
final answer. Here the values are a placeholder for work that will arrive, and a placeholder has to
be findable.

## Consequences

### Positive

- The executive screens read as the drawings intend, which is what the role's reviewers will compare
  them against.
- The full set of unsourced figures is enumerated in one module and in the table above, so the cost
  is visible rather than diffused.

### Negative

- This contradicts ADR-085 for these ten figures. ADR-085 is not superseded — it still governs every
  other screen — which means the product now has two treatments for one situation, and the next
  author meeting an unsourced figure must find out which applies.
- Captures under `docs/screens/android/08-executive/` show numbers no backend produced.
- Each figure needs removing individually when its source is built. The module makes them findable;
  it does not make them disappear.

### Neutral

- The real halves of these screens are unaffected and remain real: the portfolio budget and variance
  from `GET /analytics/executive`, active incidents from `GET /safety/incidents`, task counts from
  `GET /tasks/portfolio-summary`, the critical path from `GET /projects/{id}/critical-path`, and
  every AI panel.

## References

- `docs/architecture/adr/085-mockup-deviations-navigation-rows-and-implemented-structure.md`
- `context/phases/phase-10-mobile-offline-engine.md` — the 2026-08-13 Safety Officer ruling
- `docs/specifications/22-ai-architecture.md` §22.3 — what may be presented as model output
- `apps/mobile/src/api/safety.ts` — `ComplianceSummary`, four counts and no percentage
- `backend/src/modules/site-ops/ep/carbon-calculation.stub.ts` — Type A stub, no route
