# 102: VIEWER gains `safety:read`, `analytics:read` and `ai:read`

**Date:** 2026-09-10
**Status:** Accepted
**Deciders:** Product Owner
**Tags:** security | mobile | ux

---

## Context

`mockup/mobile/role_viewer/` is a five-screen set the product owner requested from Stitch on
2026-09-10 — Home, Projects, Map, Insights and Account Settings. Two of its screens draw cards this
role has no permission to see:

- `01_home/01_dashboard` draws a **System Insight** card: a weather-and-schedule prediction under a
  `psychology` glyph.
- `04_insights/01_analytics` is a project **analytics** page, and one of its four cards is a
  **Safety Performance** panel (safe work hours, zero-incident days) and another a **Risk Forecast**
  produced by a model.

`[CosRole.VIEWER]` in `packages/@cos/rbac/src/permissions.ts` held seven permissions:

```ts
'project:read', 'boq:read', 'task:read', 'site-ops:read',
'issue:read', 'procurement:read', 'finance:read',
```

`safety:read`, `analytics:read` and `ai:read` were not among them, and
`docs/specifications/06-rbac-permission-matrix.md` §6.8's "Viewer (`VIEWER`) — Module Permissions"
table lists the same seven modules. §20.7.9 constrains the role further: "no create/edit/approve
actions are rendered."

So the three cards could not simply be drawn. A screen that renders a module the signed-in role is
not granted is not a styling question — it is the UI asserting an entitlement the authorization
layer denies, and the two must not disagree.

## Decision

**`[CosRole.VIEWER]` gains `safety:read`, `analytics:read` and `ai:read`** — seven grants to ten —
and §6.8's Viewer table gains the three matching rows. The three cards are then drawn.

The alternative put to the product owner was to omit the cards and record the omission in each
screen's header comment under ADR-085. It was declined: the grants are the correct fix because this
role is defined as read-only across the modules it can see, and these three are modules it should be
able to see.

## Rationale

- **All three are `:read`.** Nothing about §20.7.9's "no create/edit/approve actions are rendered"
  changes, and no screen this role reaches gains a write control. The 2026-08-04 audit that
  constrained VIEWER's tab set found write controls that were **not** role-gated on `issues`,
  `tasks` and `payments`; none of the three modules added here has that problem, because none of
  them has a mobile write surface at all.
- **The role's definition already implies them.** §6.8 describes VIEWER as "Read-only across all
  modules assigned to the viewer's project scope" and the table was a subset of that, not a
  narrowing of it — the seven were the modules that had screens when the table was written.
- **Safety is read by a role with no safety duties for oversight, not action.** A viewer is the
  stakeholder looking at a portfolio; whether a site has gone 128 days without an incident is the
  kind of fact that role exists to see. `SITE_WORKER` already holds `safety:read`, and it is a role
  with strictly narrower oversight scope.
- **`analytics:read` is what the Insights page IS.** Drawing an analytics page for a role denied the
  analytics grant would leave the screen depending on the fact that it currently reads no endpoint.
  That is a dependency on an implementation gap, and it would break the day the page gains a query.
- **`ai:read` follows the same reasoning.** Two cards on this set are AI-derived. `EXECUTIVE` and
  `PROJECT_MANAGER` hold it; both are oversight roles, which is what this one is.

### What was rejected

- **Omit the three cards.** Declined by the product owner. It would also have left the Insights
  screen with two of four cards, which is not the drawing.
- **Add `analytics:read` only, and drop the two AI cards.** Offered as the middle option and
  declined.
- **Grant them at the screen instead of in the matrix.** There is no such mechanism, and inventing
  one would put an entitlement decision in a component.

## Consequences

### Positive

- The five VIEWER screens are drawn as drawn, with no card omitted for want of an entitlement.
- The UI and `@cos/rbac` agree about what this role may see, which they did not while the screens
  rendered modules the matrix denied.
- When these screens gain real endpoints, the requests they make are already permitted; nothing has
  to be re-decided at that point.

### Negative

- The read surface of a read-only role is wider than it was. Three more modules are visible to
  anyone holding `VIEWER`, scoped as ever by `project_membership` and RLS.
- Any future write capability added to the safety, analytics or AI modules must be role-gated
  explicitly. Before this decision, VIEWER was excluded from those modules by the matrix; now it is
  excluded only by the absence of a `:write` grant, which is the same protection every other role
  relies on but a weaker one than not being in the module at all.

### Neutral

- No migration, no schema change, no endpoint change. `packages/@cos/rbac/src/permissions.ts` is a
  static matrix compiled into both the backend guards and the mobile client.

## References

- `docs/specifications/06-rbac-permission-matrix.md` §6.8 — Viewer (`VIEWER`) — Module Permissions
- `docs/specifications/20-ux-flow.md` §20.7.9 — Viewer
- `docs/specifications/32-implementation-specifications.md` §32.7 — the per-role tab table and the
  VIEWER read-only constraint
- `docs/architecture/adr/085-mockup-deviations-navigation-rows-and-implemented-structure.md` — the
  rule the alternative would have been recorded under
- `docs/architecture/adr/099-mockup-figures-without-a-data-source.md` — where every figure these
  three cards print is registered
- `mockup/mobile/role_viewer/01_home/01_dashboard`, `mockup/mobile/role_viewer/04_insights/01_analytics`
