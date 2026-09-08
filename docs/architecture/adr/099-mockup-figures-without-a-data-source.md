# ADR-099: The EXECUTIVE screens print the mockup's own figures where the platform has no source

**Date:** 2026-09-05
**Amended:** 2026-09-07 — extended to the two screens the replaced mockup set added; 2026-09-08 —
the FINANCE set, then a drawn confidence on a deterministic card
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

## Amendment — 2026-09-08: the FINANCE set, and the four figures that turned out to be columns

`mockup/mobile/09_finance/` was implemented over 2026-09-07/08 — Home, Payments, Budget, Invoices
and the profile drawer. It falls under the standing rule the product owner gave on 2026-09-08:

> การ implement ui สร้างเหมือนกับ mockup ทุกอย่าง … ถ้าสิ่งใดเป็นการเติมมาเกินจริง โดยที่ codebase
> ยังไม่มี process นี้ ให้ comment ใน code ไว้ว่า coming soon
>
> คำว่า "coming soon" ให้ comment ไว้ใน code อย่างเดียว ไม่ต้อง display แต่ถ้าเป็น action
> ก็แสดง popup แสดง "comming soon"

— draw what the drawing draws; mark what has no process behind it as COMING SOON **in a code comment
and never on screen**; put a "coming soon" dialog behind an action that leads nowhere.

### What was added — eight entries, taking the register from twenty-one to twenty-nine

| Entry                   | Screen   | What it stands in for                                                                                               |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `APPROVALS_TREND`       | Home     | "+12% vs last week" — the approval queue is a snapshot; nothing records last week's total                           |
| `FINANCE_BURN_RATE`     | Home     | "฿ 1.2 M / MO" — the forecast has weekly outflows and no decision about which of them a month is                    |
| `PAYMENT_DETAIL_EXTRAS` | Payments | a service period on a payment, and a "verified subcontractor" flag on a vendor. Neither column exists               |
| `BUDGET_CATEGORY_CODE`  | Budget   | "Code: 02-100" — `budget_lines.boq_category_id` is a UUID and no coding standard exists to derive a short code from |
| `THREE_WAY_MATCH`       | Invoices | the whole advisory banner and every per-card match percentage                                                       |
| `DELIVERY_GRN`          | Invoices | "#GRN-1049" — `deliveries` carries a free-text `delivery_note` and no goods-received note number                    |
| `INVOICE_DISCREPANCY`   | Invoices | the sentence naming which line differs — the output of the matching that does not exist                             |
| `PROFILE_JOB_TITLE`     | Drawer   | "Lead Controller" — no table carries a job title                                                                    |

### THREE-WAY MATCHING DOES NOT EXIST, and it is the largest thing this register has ever held

The other twenty-eight entries are figures beside real data. `THREE_WAY_MATCH` is a whole feature:
nothing in `backend/src` reconciles a purchase order against a delivery against an invoice, and no
endpoint returns a score. Grepped, not assumed. It is drawn because the drawing builds a banner and
a three-column telemetry strip on top of it and the standing rule says to draw it, and it is flagged
here as the entry a reader should be most suspicious of.

### Its confidence is NOT drawn, and this is the strongest form of that refusal so far

The drawing labels the banner CORE_AI and prints "CONFIDENCE: 96%". The third amendment above drew a
confidence-shaped value once — `HOME_KPI_CONFIDENCE` — on a card that makes no AI claim, and refused
one on the cash-flow modules because those read a deterministic calculation and a percentage would
claim a model that never ran.

**Here nothing ran at all.** Not a calculation dressed as a model — no process whatsoever. A
percentage beside it would be the case spec §22.3 forbids outright, so it is not drawn, and neither
is the banner's "แหล่งข้อมูล: ERP DB & Central OCR Ledger". The same refusal applied to the three
cash-flow modules on Home, Payments and Budget: all three read
`GET /finance/cashflow-forecast/:projectId` through `projectedShortfall` / `gradeCashflowRisk`, all
three name the project instead of a source, and none carries a confidence.

### FOUR FIGURES CAME OFF THE LIST BEFORE THEY REACHED IT

The first draft of the Invoices screen was going to draw the PO reference, the "ส่งมอบบางส่วน"
delivery state and "Over PO +5.2%"; the first draft of the drawer was going to draw the employee id.
All four are real:

| Drawn in the first draft | What it actually is                                                            |
| ------------------------ | ------------------------------------------------------------------------------ |
| `#PO-2026-882`           | `procurement.purchase_orders.po_number`                                        |
| ส่งมอบบางส่วน            | that row's `status` — `PARTIALLY_DELIVERED` is a value of its CHECK constraint |
| Over PO +5.2%            | the invoice amount against that row's `total_amount`, in decimal.js            |
| `ID: FI-04281`           | `workforce.workers.employee_code`, returned by `GET /users/me`                 |

Reading the migration before writing the register entry is the whole procedure, and it is worth
stating because this register grows more easily than it shrinks. The employee id keeps its UUID
fallback: `user.service.ts` says null is the COMMON case there — office roles, finance included,
have no worker record — so the drawer shows a short form of the UUID rather than a gap.

### The three obligations are unchanged

Every entry names what has to exist before it can go; every one lives in
`apps/mobile/src/lib/mockupFigures.ts` and nowhere else; and each is guarded by a test that fails if
the screen ever starts tracking real data instead — `budget.spec.tsx` on the category code,
`invoices.spec.tsx` on the banner, the GRN and the score, `NavigationDrawer.spec.tsx` on the job
title, `finance-home.spec.tsx` on the trend and the burn rate.

## Amendment — 2026-09-08 (second): a confidence ON a card that reads a deterministic forecast

The three cash-flow modules shipped on 2026-09-07/08 without the `CONFIDENCE: 92%` their drawings
put on them, and the reasoning was recorded twice — in this ADR's third amendment and on each
screen. It was this:

> The forecast is a deterministic sum of scheduled inflows and outflows. A confidence beside it
> claims a model that never ran, which is the case spec §22.3 is most explicit about.

**The product owner looked at the captured Home frame on 2026-09-08 and directed that the chip be
drawn**, together with the drawing's `chevron_right`, its `View Model` link and the rule above its
source line. That is the standing rule of the same day applied consistently — build the mockups as
drawn; mark what has no process behind it COMING SOON in a code comment, never on screen; put a
dialog behind an action that leads nowhere. `View Model` opens that dialog.

### What this changes in the rule, and what it does not

`FORECAST_CONFIDENCE` is registered like every other drawn figure and is the ONLY one on a card that
carries an `insights` glyph. The line this file used to hold — _no value in this register may be
presented as a model output_ — no longer holds without qualification, and the register's own header
now says so rather than reading as though the rule were intact.

**What still holds, and is the part worth defending:** a fabricated confidence may never stand
BESIDE a real one. Where a screen calls a real model endpoint it prints the model's own text and the
model's own confidence — the executive AI panels, and the risk feed whose drawn cards are displaced
entirely the moment `POST /ai/reports/delay-risk` answers. Nothing here loosens that.

### The one thing that was NOT taken from the drawing

`Source: ERP & Milestone data`. The footer keeps naming the PROJECT the figures came from. Naming
integrations this platform does not have is a claim about provenance rather than about a quantity,
and it is the carve-out ADR-098's second amendment and this record have both kept from the start.
The product owner's correction asked for the rule above that line and the model link beside it, and
both are there.

### The register is at thirty

`FORECAST_CONFIDENCE`. `FINANCE_BURN_RATE` also grew a second field the same day — the drawing's
progress bar under that tile has no more behind it than the figure above it, so the bar's fill is
part of the same entry rather than a new one.

## Amendment — 2026-09-08 (third): the invoices banner gets a source, and it is not the drawing's

The product owner asked for two changes to `01-fn-invoice` on 2026-09-08: the matching banner was
missing the source line the drawing foots it with, and the "Invoiced" label under each invoice card
was to come off. The second is not a register matter — that label read a REAL column,
`purchase_orders.status`, and it went because the card is a decision to approve or dispute and the
order's own delivery progress is not part of that decision. The `finance.invoices.poStatus.*`
messages went with it; nothing else read them.

### The first one is, and it is the line this record has refused four times

The drawing foots the banner `แหล่งข้อมูล: ERP DB & Central OCR Ledger`. There is no ERP integration
in this repository and no OCR ledger; `/ai/transcribe` is the only thing in the AI gateway that
reads a document at all, and nothing calls it from this screen. Every other card in the FINANCE set
foots with the PROJECT its figures came from — the carve-out ADR-098's second amendment opened and
this record has applied on Home, on Payments and on Budget.

It is applied a fourth time here. What the banner now says is
`Source: vendor invoices and purchase orders`, which is true of the list above it: those rows are
`listVendorInvoices` and `poIndex`, both `procurement`. The drawn figures in the banner keep the
drawing's shape; the sentence that says where they came from does not.

### Why a provenance line is treated differently from a figure

A drawn quantity is one wrong number on a screen the reader is already scanning. A drawn source is a
claim about the whole card — it tells the reader which of the numbers above it to trust, and naming
a system that does not exist makes every drawn figure on that card read as fetched. The register
holds figures. It does not hold provenance, and after this amendment it still does not.

### The chevron moved rather than multiplied

`01-fn-invoice` has exactly one chevron on this card and puts it in the footer. The 2026-09-08
instruction that added a confidence and a chevron to the banner had put both in the header, which
left the drawing's footer empty and its one control duplicated once the footer arrived. The header
keeps the confidence; the footer takes the source and the chevron.

### The register is unchanged at thirty

`THREE_WAY_MATCH` gained no field. The source is an i18n message like any other sentence on the
screen, because it is not drawn — that is the whole point of the amendment.

## Amendment — 2026-09-08 (fourth): the role chip left, and the drawn line is now alone

`01-fn-navigation-drawer` was corrected on 2026-09-08: the `FINANCE` chip beside the name came off,
and the position and id lines swapped so the block reads NAME · POSITION · ID. Spec §32.7 "Drawer
Profile Block" carries the composition; this record carries the consequence.

### `PROFILE_JOB_TITLE` was a second opinion, and it is now the only one

The chip printed `auth.role` — real, per-account, and the one line in the block that differed
between a FINANCE user and a SITE_ENGINEER. `PROFILE_JOB_TITLE` is a single registered string,
`Lead Controller`, rendered unconditionally for everybody. While the chip was there the drawn line
sat beside a real one and could be read against it. It no longer can: **every role's drawer now says
Lead Controller and nothing on the block contradicts it.**

That is a widening, and it is written here rather than left to be discovered. The entry was added on
2026-09-08 for the FINANCE set and was never scoped to it — the same defect existed the moment it
was wired, and removing the chip is what made it visible.

### It was not fixed by inventing seven more

The obvious repair is a title per role. That is seven more fabricated positions, in a register whose
whole purpose is to keep the count of them known and falling, to cover a gap in
`platform.users` — which has no title column, no `position`, and no join that carries one.
`workforce.workers.trade_type` is the nearest real field and it is a SITE TRADE, not an office
position; putting "Electrician" under a controller's name would be worse than one wrong title.

### What would end it

A `position` (or `job_title`) column on `platform.users`, surfaced by `GET /users/me` beside
`employee_code`. Until then the line is drawn, it is the same for everyone, and both facts are
recorded in the spec section, in the component's own comment and here.

### The register is unchanged at thirty

No entry added. `PROFILE_JOB_TITLE` changed neither value nor shape — only what stands next to it.

> **Answered the same day.** See the fifth amendment below: `platform.users.position` was added on
> 2026-09-08 and this entry was deleted.

## Amendment — 2026-09-08 (fifth): the first entry removed because the data arrived

Amendment 4, above, closed with a section headed "What would end it": a `position` column on
`platform.users`, surfaced by `GET /users/me`. The product owner asked for it the same day. It exists
— migration `20260908000001_user_position`, ADR-101 — and **`PROFILE_JOB_TITLE` has been deleted**.

### Why this one matters more than its size

Entries have left this register before. Every one of them left because the SCREEN went: a feature
was cut, a tile stopped being drawn, a card was replaced. That is attrition, not payment.

This is the first entry removed because **the column arrived**. The register's premise is that a
drawn figure is a debt with a named creditor — the missing table — and that writing the debt down
makes it collectable. Amendment 4 named this creditor in one sentence and the sentence was acted on
within the day. The mechanism worked exactly as designed, and that is worth recording, because a
register nobody ever pays down is just a list of things wrong with the product.

### What replaced it, precisely

`NavigationDrawer` reads `me.position` from `GET /users/me`. **Where it is null it draws nothing** —
no placeholder, no dash, no role in its place. That refusal is the entry's real legacy: a fallback
string would be `PROFILE_JOB_TITLE` back under another name, and the test that used to assert the
drawn title now asserts its absence.

Null is the ordinary case and will be for a while. No route sets a position; it arrives by seed
(`positionFor(role)` in `seed-realistic.ts`) or by an HR import. ADR-101 records that as a deliberate
boundary rather than an oversight.

### The register is at thirty

Thirty-one before, thirty after — counted, not recalled:
`grep -c "^export const [A-Z_]* = figure(" apps/mobile/src/lib/mockupFigures.ts`. The header comment
in that file records the deletion beside the eight entries the FINANCE set added four days earlier.

## Amendment — 2026-09-08 (sixth): the PROCUREMENT_OFFICER set, and the six figures that were columns

`mockup/mobile/10_proc_officer/` — six drawings: a dashboard, RFQs, orders, deliveries, the drawer
and a settings sheet. The register goes from thirty entries to forty.

### What was added — ten entries

| Entry                 | Screen     | What it draws                                                     |
| --------------------- | ---------- | ----------------------------------------------------------------- |
| `PROC_ACTIVITY_FEED`  | Home       | The two "recent activity" rows                                    |
| `RFQ_MATERIAL`        | RFQs       | The material title and quantity on every card                     |
| `RFQ_PRICE_DELTA`     | RFQs       | "−4.2%" against the estimate                                      |
| `RFQ_RECOMMENDATION`  | RFQs       | The recommended vendor, 94/100, 98% on time                       |
| `PROC_SAVINGS`        | RFQs       | The savings target and its "+12% MoM"                             |
| `PO_DELAY_ALERT`      | Orders     | "3 POs at risk of a 72-hour delay at Port of Rayong"              |
| `DELIVERY_STATUS`     | Deliveries | Every status pill, the in-transit and due tiles, the on-time rate |
| `DELIVERY_GRN_NUMBER` | Deliveries | The goods-receipt numbers                                         |
| `DELIVERY_TELEMETRY`  | Deliveries | Road position, distance, driver, plate, average speed             |
| `DELIVERY_SIGNOFF`    | Deliveries | The inspector's signature and the 60/60 count                     |

### `procurement.deliveries` has no status column, and that is one entry rather than six

The largest single entry here is `DELIVERY_STATUS`, and it is worth reading as one fact rather than
as a list. The table is `delivery_id, po_id, tenant_id, delivery_note, delivered_at, received_by,
notes`. **A row exists once someone records a delivery.** So the table can say "this arrived" and has
no way to say "this is on its way" — which makes TRANSIT, INSPECTION and COMPLETED, the in-transit
tile, the due tile and the on-time percentage all the same missing column, not six missing figures.
A status column plus a promised arrival time deletes the entry whole.

### FIVE FIGURES CAME OFF THE LIST BEFORE THEY REACHED IT

This set put back more than any before it, and each one is worth naming because each was about to be
drawn:

- **every vendor name on an order and a delivery** — `GET /procurement/vendors/directory` already
  returns every active vendor, so one request builds a client-side index. **No backend join**,
  unlike the FINANCE invoice case of the same week (ADR-100): that screen is finance and may not
  read procurement's tables; this one IS procurement
- **the RFQ countdown** — `procurement.rfqs.deadline` is a real `timestamptz`, so "18h remaining" is
  measured
- **a purchase order's ETA** — `purchase_orders.delivery_date`, and nothing is drawn where it is null
- **the project name on every card** — `getMyProjects()`, indexed client-side
- **purchase requests awaiting approval** — real the moment the seed grew `SUBMITTED` rows

### THE DELIVERY PERCENTAGE WAS REFUSED RATHER THAN DRAWN, and that is the notable decision

`03_orders/01_po_order` puts "Delivery Progress · 65%" and a filled bar on every order card. The
figure is COMPUTABLE — `delivery_items.quantity_received` against `po_line_items.quantity` — and
reaching both for one row costs two requests, 84 for the seeded tenant, on a screen that renders in
one.

It was not added to this register. The card shows the STAGE the order is genuinely at, from its own
status and its own delivery count, and **prints no number at all**. Drawing a 65% would have been the
easy option and would have put a fabricated MEASUREMENT on a purchasing screen — a percentage reads
as counted in a way a status word does not. An aggregate endpoint returning received-against-ordered
per PO is what would put the bar back with a number on it.

### A SIXTH WAS ATTEMPTED, WAS WRONG, AND IS WORTH MORE THAN THE FIVE ABOVE

The quotation count per RFQ was going to be the sixth. `GET /procurement/rfqs/:rfqId/quotations`
looks exactly like its source: a `@Get`, summary "Compare quotations for an RFQ (sorted by price
ASC)", `@Roles(...READ_ROLES)`. A per-row fetch was written against it and the first capture came
back with a column of zeros.

**It is not a read.** `ProcurementService.compareQuotations` asserts the RFQ is `CLOSED`, throws 422
when it holds no quotations, and then **marks the lowest one selected**. It is a step of the award
workflow wearing a GET. The zeros were 45 rejected calls; on a tenant holding a CLOSED RFQ, opening
the list would have awarded it.

Nothing was mutated — the seeded tenant has no CLOSED RFQ — and the call came out the same day.
**Neither the count nor the lowest price was moved into this register in its place.** A figure nobody
can fetch is not one to invent on a screen whose job is to say how much interest an RFQ has attracted;
the card shows what it can prove. A read-only quotations endpoint, or a count on the RFQ list, brings
both back as real.

The lesson generalises past this entry: reading a route's decorator is not reading the route.

### The register is at forty

Counted, not recalled: `grep -c "^export const [A-Z_]* = figure(" apps/mobile/src/lib/mockupFigures.ts`.
Thirty before, ten added, none removed.
