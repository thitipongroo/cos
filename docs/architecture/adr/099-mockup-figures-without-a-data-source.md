# ADR-099: The EXECUTIVE screens print the mockup's own figures where the platform has no source

**Date:** 2026-09-05
**Amended:** 2026-09-07 — extended to the two screens the replaced mockup set added
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

---

## Amendment — 2026-09-07: the register grows from ten entries to nineteen

**Decided by:** Product Owner, 2026-09-07 ("ขยาย ADR-099 วาดทั้งหมด" — extend it, draw them all)

`mockup/mobile/08_executive/` was replaced in commit `a23b385b` (ADR-098's own amendment records the
navigation half of that change). Two screens are new — `03_portfolio/01_ex_portfolio` and
`04_report/01_ex_report` — and both carry figures with no source. The question was put with the same
conflict named as in 2026-09-05, and the decision went the same way.

**Two of the drawings' inventions turned out to be real and are NOT in the register.** They were
checked before being registered, which is the point of checking:

| Drawn as invented                     | Actually                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| "Strategic Recommendations" (Report)  | `recommendations` on `EXECUTIVE_SUMMARY` — the model's own advice                       |
| The CRITICAL row's "AI Flag"          | `risk_flags` on the same report                                                         |
| Each card's budget pillar (Portfolio) | `utilizationPct` on `GET /analytics/executive`                                          |
| The four filter counts and the sort   | `executiveSeverityOf` over those same rows — the mapping `alerts.tsx` already documents |

### What was added

| Figure                                   | Why it cannot be computed                                                                                                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `สุขภาพพอร์ต 91.4%` (portfolio health)   | No health score is defined anywhere in the product. The analytics row is budget, utilisation and an at-risk flag; nothing combines them into a grade.                                         |
| `Contract #CT-8832` on each project card | `finance.contracts` has no contract-number column, and no mobile endpoint reads that table at all.                                                                                            |
| `Bangkok CBD` beside it                  | `projects.projects` has no address and no coordinates — the same gap as the Locations map above.                                                                                              |
| Schedule pillar (`ตรงเวลา (+2 วัน)`)     | ADR-097 gives float on a project's critical path, not a project-level days-ahead/days-behind figure.                                                                                          |
| Safety pillar (`0 อุบัติเหตุ (120 วัน)`) | `GET /safety/incidents` is per project; a count per card is one request per project — the fan-out `GET /tasks/portfolio-summary` exists to avoid.                                             |
| Quality pillar (`99.1% ผ่านเกณฑ์`)       | Inspections record PASS/FAIL per item; nothing aggregates them into a per-project pass rate.                                                                                                  |
| `Index: 96/100` per card                 | The same missing health score, at project scope.                                                                                                                                              |
| The Report brief's three metrics         | A cost-saving ledger, a delivery-date forecast and a safety index. Budgets are a snapshot, not a saving; §32.12 progress is completion, not a forecast; the index is the missing score again. |
| `Export Portfolio PDF`                   | Nothing renders a portfolio document. `lib/dataExport.ts` offers JSON and CSV for the PDPA subject-access export.                                                                             |

### One entry is flagged, and this is where

**`PROJECT_CONTRACT_CODES` is the entry to remove first.** Every other figure here is a NUMBER, and a
wrong number is read as a number. A contract identifier is the most quotable string on the screen —
someone reads it into an email, or into a phone call with a vendor — and it sits beside a real
project name, which is exactly what makes it look authoritative. It is drawn under the decision
above, and it is named here so the removal has an obvious first candidate rather than requiring the
whole register to be reviewed at once.

### One boundary this amendment draws

**A false PROVENANCE claim is not an ADR-099 figure**, and the Home drawing's `SOURCES: BIM & ERP
DATA` footer is the case that established it. BIM is a Type A stub (§32.9) and there is no ERP
integration, so the line would tell an executive that the report above it is grounded in two
enterprise systems that are not connected. A wrong number is wrong about one quantity; a false
source is wrong about how much of the screen to believe. The footer is drawn in the drawing's own
treatment and names the source the panel CAN name — the project the report was produced for.
`<ExecRiskAlerts />` reached the same conclusion on 2026-09-05 about the same drawing's
"BIM + Site Logs" chip, before this amendment made it a rule.

### The three obligations are unchanged

One module, no value presented as an AI output, and the two capture READMEs kept honest. The module
header now states the count so a reader can tell at a glance whether the register has grown without
a decision behind it.

---

## Amendment — 2026-09-07 (second): drawn ADVICE, and the line it does not cross

**Decided by:** Product Owner, 2026-09-07 — "build what the drawing draws; where there is no process
behind it, mark it COMING SOON in a comment."

The Portfolio drawing puts an **advice strip** on its CRITICAL card: a tinted band under a
`smart_toy` robot glyph reading "AI recommends: hold the next disbursement and negotiate the rebar VO
claim." The instruction extends it to the amber cards as well.

**It is drawn, and its TEXT is derived rather than copied.** The strip's shape, tone, glyph position
and lead word all follow the drawing. What it says is the reason the card is in its band — over
budget, flagged at risk, or invoices overdue — read from `executiveSeverityOf`, the same rule the
filter chips and the sort already use.

**Why not the drawing's own sentence.** Obligation 2 of this record says no value here may be
presented as a model output, because a fabricated finding standing beside real figures is the case
spec §22.3 is most explicit about. This screen makes **no AI call at all**: printing a specific
recommendation under a robot glyph would attribute advice to a model that never ran, on a screen
with no model on it. That is a different thing from a drawn NUMBER, and obligation 2 still stands.

**COMING SOON is the honest label for the drawing's version**, and it is recorded in the code at the
element: an advice engine per project. Nothing in this platform produces one.

### The register did not grow

No new entry. The strip prints derived text, not a figure, so there is nothing here to delete when
the engine arrives — the strip simply starts saying something better. The register stays at
nineteen.

---

## Amendment — 2026-09-07 (third): a drawn LABEL inside a card of real model output

**Decided by:** Product Owner, 2026-09-07, with the conflict named before the decision.

The risk-alert cards on the Alerts screen carry four things in their drawing: a severity chip, a
CATEGORY chip ("BIM + Site Logs", "Supply Chain"), a per-card confidence, and a title over a body.
`DelayRiskOutput` — read from `services/ai-gateway/reports/models.py`, not assumed — is:

```python
delay_risk_level: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]   # ONE, for the whole report
risk_factors: list[str]                                          # one bare string per card
confidence: float                                                # ONE, for the whole report
data_points_used: int
disclaimer: str
sources: list[str]
```

So the card has no category, no per-card confidence, and no second line.

**The decision: draw the card in full, use the real values where they exist, and register the
category chip.** `RISK_ALERT_CATEGORIES` is the twentieth entry in `mockupFigures.ts`.

### This is the first entry that sits inside a card of real model output

Obligation 2 of this record says no value here may be presented as a model output. Every entry until
now sat on a KPI card, a summary strip or a project row — beside real figures, never inside one of
the model's own findings. This one does, and the carve-out is therefore written narrowly:

| Drawn inside a model's card                     | Allowed?                                                                                                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A category LABEL                                | Yes, by this decision                                                                                                                                                                         |
| A CONFIDENCE                                    | **No.** It is the case spec §22.3 is most explicit about, and the cards print the report's own number instead — the same one on each, because the report carries one                          |
| A FINDING, or a second line of one              | **No.** Writing it would be composing the model's output for it                                                                                                                               |
| A claim about which SYSTEMS produced the report | **No.** ADR-098's second amendment keeps that off these screens; the drawing's "BIM + Site Logs" is not used, and the register carries the drawing's own second card's SUBJECT labels instead |

### What it costs

A reader cannot tell the drawn label from the real finding beside it. Nothing on the card marks the
difference, and nothing can without saying "this label is invented", which is worse than the label.
The mitigation is the one this record has always relied on: the value lives in the register, `grep
mockupFigures` finds every use, and deleting the module is how the decision is reversed.

### And then the FINDINGS were drawn too

Same day, after the screen was photographed and the feed came out empty where the drawing shows it
full: **draw the cards always, and use the mockup's content when there is no report.**
`RISK_ALERT_FALLBACK` is the twenty-first entry.

**This crosses the line the table above draws**, and the table is not being quietly rewritten: a
drawn FINDING is still the thing this record is most careful about, and it is drawn here because the
product owner directed it with that stated. What makes it survivable is that it is a FALLBACK and not
a source — the moment `POST /ai/reports/delay-risk` answers, every card comes from the model and none
of the register is read. The two paths are exclusive, they differ in shape (a report carries one
level and one confidence for all its findings; the drawing gives each card its own), and
`ExecRiskAlerts.spec.tsx` asserts that a real report displaces the drawn cards entirely.

**What it needs before deletion is nothing.** The endpoint is built. It needs to be REACHABLE: the
`ai-gateway` container verifies bearer tokens against `KEYCLOAK_URL`, and a machine that leaves that
at the host value rejects every one of them. That was fixed in `docker-compose.yml` in the same
commit — the service already overrode Kafka, Redis and Postgres to their in-network names, and
Keycloak had been missed.

### The register is at twenty-one

`RISK_ALERT_CATEGORIES` and `RISK_ALERT_FALLBACK`. The per-card confidence on the REAL path is the
report's own field and is not registered; the drawing's second body line appears on the drawn cards
only, never beside a model's finding.
