# ADR-098: The EXECUTIVE mobile bar follows its mockups, against an enumerated spec nav

**Date:** 2026-09-05
**Amended:** 2026-09-07 — see "Amendment" at the foot of this record
**Status:** Accepted, superseded in part by its own amendment
**Deciders:** Product Owner
**Tags:** mobile | architecture

---

## Context

`mockup/mobile/08_executive/` arrived on 2026-09-04 with five drawings. All four that carry a bottom
navigation draw the same one:

```text
Home | Tasks | Safety | More
```

The code and two specifications said something else, and had agreed with each other since Phase 10:

| Source                                             | EXECUTIVE bottom nav                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/mobile/src/lib/roleTabs.ts`                  | Home · Portfolio · Alerts · Reports                                                      |
| `docs/specifications/20-ux-flow.md` §20.7.1        | `/` · `/portfolio` · `/alerts` · `/reports`                                              |
| `context/phases/phase-10-mobile-offline-engine.md` | "EXEC role (source §4.2): Bottom nav: Home \| Portfolio \| Alerts \| Reports \| Profile" |

**This is not the situation the two previous mockup-led nav changes were in.** When
`PROJECT_MANAGER`'s bar changed (2026-08-10) and when `SAFETY_OFFICER`'s was settled (2026-08-13),
the specification enumerated **no** navigation for those roles — §20.7.7 says so in those words for
the Safety Officer — so the drawings were the only statement in existence and following them
contradicted nothing. Here the specification does enumerate one, and `context.md` §On ambiguity is
explicit that where the two disagree, the specification wins.

So this could not be settled by precedent. It was escalated, with the cost of each option stated,
and decided by the product owner on 2026-09-04.

## Decision

**The bar becomes `Home · Tasks · Safety · More`**, and §20.7.1, §32.7's per-role table and
`context/phases/phase-10-mobile-offline-engine.md` are amended to match in the same commit (Rule 37).
The specification is changed rather than deviated from.

Every screen that left the bar keeps an entry point, which was the condition of the change:

| Screen       | Where it went                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `/portfolio` | Drawer row (already `DERIVED` "Executive dashboard" — suppressed only because it was a tab) + a More tile |
| `/alerts`    | A new `NOT_DERIVED` drawer row + a More tile                                                              |
| `/reports`   | Drawer row only (already `DERIVED` "Site reports")                                                        |

`/reports` gets no More tile because the drawing has none. Its seven tiles are portfolio report,
financial forecast, risk centre, vendor directory, strategic BIM, carbon accounting and global site
map; inventing an eighth to make the three departures symmetrical would be adding composition the
mockup does not carry, which is the opposite of what ADR-085 permits. One entry point is what the
screen needs, and the drawer row is that entry point.

`/alerts` needed the explicit entry because it was in neither drawer table: §6.4 governs no module
for a risk feed, so it cannot be derived honestly, and removing its tab without adding the row would
have left the role no route to it at all.

**`safety` is a new route, not a re-pointing of an existing one.** Three safety screens already
exist and none of them is the drawing: `safety-checklist` fills in one checklist, `inspections`
lists them, `incidents` is the Safety Officer's feed for one site. The executive drawing is a
portfolio view — compliance across every project, incidents by severity, a ranking of sites — which
is a different question from all three. Pointing the tab at one of them would have put the executive
on a site-scoped screen and called it a portfolio.

**`tasks` and `more` branch on role**, the pattern `reports.tsx` already uses. `tasks` renders the
Site Worker's day list for the field roles and the portfolio roll-up for the executive; `more`
renders the manager's six tiles or the executive's seven.

## Rationale

What the three options actually cost:

| Option                                         | Consequence                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chosen** — follow the mockups                | Matches the newest artefact and the two previous rulings' direction. Costs a spec amendment across three files, and opens the question of what the Tasks and Safety screens can honestly show, since much of what they draw has no source (handled in ADR-097 and ADR-099). |
| Follow the specification                       | No spec change, and all four tabs already work against real data. Costs three of the five new drawings, and reads as overruling the product owner's own most recent artefact.                                                                                               |
| Hybrid (e.g. Home · Portfolio · Safety · More) | Would have avoided the Tasks screen's two unresolved data questions entirely. Rejected as a bar no drawing shows and no spec states — the worst provenance of the three.                                                                                                    |

## Consequences

### Positive

- The role's four screens match the drawings a reviewer will hold them against.
- `/portfolio`, `/alerts` and `/reports` each gained a second entry point (drawer **and** More tile)
  rather than merely being relocated.
- The specification now says what the product does. The previous state — code agreeing with the spec
  and both disagreeing with the drawings — was the same shape as the Safety Officer drift that went
  nine days unseen.

### Negative

- Two screens with real, working data moved one tap deeper.
- The Tasks and Safety tabs carry more unavailable figures than the screens they displaced. That is
  a property of the drawings, recorded in ADR-099, not a consequence of the navigation itself.
- Three specification files now carry an amendment whose only justification is a drawing.

### Neutral

- `reports` remains a tab for `SITE_ENGINEER`; only `EXECUTIVE` left its `roles` list.
- No other role's bar moved. Every table row this change touched is matched by `EXECUTIVE` alone or
  gained it without displacing another role's ordering.

## References

- `mockup/mobile/08_executive/` — the five drawings
- `docs/specifications/20-ux-flow.md` §20.7.1
- `docs/specifications/32-implementation-specifications.md` §32.7 Bottom Navigation
- `context/phases/phase-10-mobile-offline-engine.md` — EXEC role block
- `docs/architecture/adr/085-mockup-deviations-navigation-rows-and-implemented-structure.md` —
  how far mockup authority runs
- `docs/architecture/adr/097-task-dependencies-and-critical-path.md` — what the Tasks tab needed built

---

## Amendment — 2026-09-07: the mockup set was replaced, and the bar with it

**Decided by:** Product Owner, 2026-09-07

`mockup/mobile/08_executive/` was replaced wholesale in commit `a23b385b`, four days after the
drawings this record was written from:

| Before                    | After                                   |
| ------------------------- | --------------------------------------- |
| `01_home/01_ex_dashboard` | rewritten — 485 lines, new `screen.png` |
| `02_tasks/02_ex_tasks`    | renamed to `02_alerts/02_ex_alerts`     |
| `03_safety/01_ex_safety`  | deleted                                 |
| `04_more/01_ex_more`      | deleted                                 |
| —                         | `03_portfolio/01_ex_portfolio` (new)    |
| —                         | `04_report/01_ex_report` (new)          |

**The bar becomes `Home · Alerts · Portfolio · Reports`.** It is not the pre-09-05 bar restored:
that one was `Home · Portfolio · Alerts · Reports`, and the middle two have swapped.

**The order was decided, not read, and that is the substantive change to this record's reasoning.**
The original decision above rests on the four drawings agreeing with each other — "All four that
carry a bottom navigation draw the same one". The replacement set does not have that property. Its
four `<nav>` blocks give four different bars, and the glyph attached to each label contradicts itself
across the set:

| Glyph               | Labelled                                                     |
| ------------------- | ------------------------------------------------------------ |
| `assignment`        | "Alerts" on three screens, "Tasks" on the fourth             |
| `health_and_safety` | "Report", "Home" and "Portfolio" on three different screens  |
| `analytics`         | the ACTIVE tab on BOTH `01_home` ("Home") and `03_portfolio` |

The labels were changed over an older bar without the icons being moved. ADR-085 makes a mockup
authoritative for STYLE, which presumes a drawing that says one thing; a self-contradictory drawing
settles nothing. So the order came from the product owner directly, and the three returning tabs keep
the glyphs they shipped and were captured with before 2026-09-05 — `notification-important`,
`pie-chart` and `description`.

**`04_report` is not a new route.** The screen it draws is the AI executive summary `/reports`
already renders for this role, in a styled form. Adding a route for it would have put one screen
behind two paths, which is the mistake `dashboard` and `home` made. The tab keeps the label
"Reports", which is what that drawing's own active tab reads.

### Where the three departing screens went

The same condition applied in reverse, and the product owner stated it in those terms — keep all
three, reach them from the drawer:

| Screen    | Where it went                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------- |
| `/tasks`  | Drawer row, unaided — already `DERIVED` from §6.4's "Tasks" row, suppressed only while it was a tab |
| `/safety` | A new `NOT_DERIVED` drawer row — §6.4 governs no module for a portfolio safety overview             |
| `/more`   | A new `NOT_DERIVED` drawer row — a hub over other screens is not a module either                    |

`/alerts` LOST the `NOT_DERIVED` row this record gave it. `drawerLinksFor` suppresses any row whose
route is on the bar, so the entry could only ever be dead configuration reading as a live decision.
The reason it existed still holds and is recorded in place: if `/alerts` leaves the bar again it
returns to `NOT_DERIVED` and not to `DERIVED`.

`/safety` also made the full three-step exit from `ALL_TABS` — out of `TAB_ROUTES`, an explicit
`href: null` in `MobileNav`, and a breadcrumb — because it is now a tab for no role at all, which is
precisely the condition under which expo-router auto-registers a route as a visible tab on every
bar. `/tasks` and `/more` needed none of that: both are still tabs for other roles.

### What this amendment does not change

- The `safety` route is still a route of its own, for the reasons stated above; it changed its entry
  point, not its justification.
- `tasks` and `more` still branch on role inside the screen.
- No other role's bar moved.
- ADR-099's register still governs the figures these screens print, and grows to cover the two new
  ones.

### Negative consequence, stated plainly

This is the second bar this role has had in three days, and the third since Phase 10. Every change
has been driven by a replaced drawing rather than by a defect in the previous bar, and each one costs
an amendment to §20.7.1, §32.7, the Phase 10 EXEC block, the conformance test and the captures. The
role's navigation is being set by the most recent artefact rather than by a settled view of what the
executive opens the app to do.
