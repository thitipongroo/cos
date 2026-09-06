# Rule 38 — Implementation plan: EXECUTIVE role UI (mockup 08_executive) + CPM engine + Android capture

**Requested:** 2026-09-04 · **Revised:** 2026-09-04 after the product owner answered all 5 escalations
**Status:** COMPLETE. All six escalations answered by the product owner; every obligation below has
filesystem or command evidence. ESC-6 was answered **A** — completion gate 3 keeps the ADR-026
derivation and was not touched.

**Spec read line by line (by me, with `Read`/`sed`, no subagent):**

| Source | What was read |
| ------ | ------------- |
| `mockup/mobile/08_executive/{01_home,02_tasks,03_safety,04_more,05_profile}/…/code.html` | whole `<body>` of all five |
| `docs/specifications/20-ux-flow.md` §20.7.1 | lines 405–430 |
| `docs/specifications/32-implementation-specifications.md` §32.7 Bottom Navigation | lines 1710–1800 |
| `docs/specifications/11-database-schema.md` | lines 405–445 (Task columns + the 7 completion gates) |
| `docs/specifications/10-construction-ontology.md:117` · `12-construction-knowledge-graph.md:120` | `Task DEPENDS_ON Task` (N:M) |
| `context/phases/phase-10-mobile-offline-engine.md` | lines 125–160, 270–285 (EXEC nav + screens) |
| `apps/mobile/src/lib/roleTabs.ts` · `src/components/MobileNav.tsx` | whole file |
| `apps/mobile/src/components/home/ExecHome.tsx` · `(app)/{portfolio,alerts,more,tasks}.tsx` | whole / headers |
| `apps/mobile/src/api/safety.ts` 1–80 · `backend/…/{safety,tasks,analytics.*}.controller.ts` · `analytics.service.ts` 90–160 | RBAC + response shapes |
| `backend/src/modules/tasks/tasks.repository.ts` | lines 276–340 (gate 3 predecessor query, ADR-026) |
| `backend/src/modules/site-ops/ep/carbon-calculation.stub.ts` · `backend/src/modules/graph/README.md` | stub status · KG write path |
| `infrastructure/clickhouse/initdb.d/03-aggregation-tables.sql` · `05-carbon-tables.sql` | every analytics table that exists |
| `apps/mobile/scripts/capture-android-safety-officer.mjs` · `docs/screens/android/README.md` | capture precedent |

---

## Decisions taken by the product owner (2026-09-04)

| # | Decision |
| - | -------- |
| **D1** (ESC-1) | **Bottom nav follows the mockups** — `Home · Tasks · Safety · More`. `portfolio` / `alerts` / `reports` leave the bar and are reached from the drawer + More tiles. §20.7.1, §32.7 and Phase 10 are amended to match, in the same commit (Rule 37). |
| **D2** (ESC-2) | **Draw all five action buttons and state they are not usable yet** — the `more.tsx` convention. `Dismiss` and `ปรับแผนด่วน` therefore write nothing, so Phase 10's read-only constraint is not breached. |
| **D3** (ESC-3) | **Add a backend aggregate endpoint** for the portfolio task roll-up. No client-side fan-out. |
| **D4** (ESC-4a) | **Count from real lateness** — `overdue` = `planned_end < today AND status <> COMPLETED`; `due this week` = `planned_end` within 7 days; `blocked` = `status = BLOCKED`. The word "Critical" leaves the tile heading, since no column supports it. |
| **D5** (ESC-4b) | **Build the CPM engine and task-to-task dependencies in this round**, not later. |
| **D6** (ESC-5) | **Use the drawer set `drawerLinks.ts` already derives** from §6.4; no re-export of the mockup. |
| **D7** (10 figures) | **Print the mockup's own numbers** for the figures the platform cannot compute. Raised as conflicting with ADR-085 and with `docs/screens/README.md`'s claim that captures are live data; product owner confirmed after that was stated. Mitigations are obligations 6.1–6.3 below. |

---

## NEEDS_ESCALATION — 1 new, opened by what D5 turned up

### ESC-6 — Task dependencies already exist by a different mechanism (ADR-026). `AWAITING_DECISION`

`backend/src/modules/tasks/tasks.repository.ts:307-329` implements completion gate 3 today, and its
own comment says how: *"Predecessors are tasks whose BOQ item sits in the parent BOQ category of this
task's BOQ item (ADR-026 — BOQ hierarchy is category-level)."* There is **no** task-to-task edge — and
`DEPENDS_ON`, which `10-construction-ontology.md:117` and `12-construction-knowledge-graph.md:120`
both define as a Task→Task N:M relationship, returns **zero hits** anywhere in the codebase.

So D5 adds a **second** dependency mechanism beside an existing one. What gate 3 does afterwards has
to be decided, because changing it silently alters an existing hard block on task completion.

| Option | Consequence |
| --- | --- |
| **A (recommended)** — gate 3 keeps ADR-026 unchanged; the new table feeds CPM only | No behaviour change to an existing hard block. Two mechanisms coexist, documented in the new ADR, unification left as named future work. |
| **B** — gate 3 switches to the explicit table | One mechanism, but every task without an explicit predecessor row stops being gated — a hard block silently weakens the day it ships. |
| **C** — gate 3 checks both | Strictest. Risks over-blocking: a task gains predecessors it never had, from a category rule that was never meant to combine with an explicit one. |

**Not a blocker for PARTS 1–4** — only obligations 0.6 and 0.7 wait on it.

---

## Measured baseline (every figure measured in this session)

| Fact | Value |
| ---- | ----- |
| Mockup screens under `mockup/mobile/08_executive/` | 5 |
| `05_profile/…/screen.png` | 28 bytes, `<FIFE Image failed to fetch>` — no image exists |
| Role folders in `docs/screens/android/` | 8; **no `08-executive/`** |
| EXECUTIVE tabs in code today | `home` · `portfolio` · `alerts` · `reports` |
| Emulator | `emulator-5554  device` |
| Debug APK | 122,014,421 bytes, 2026-08-13 — **not installed** (258 packages, no `com.constructionos.cos`) |
| Docker | `make docker-up` up: postgres · pgbouncer · redis · kafka · schema-registry · minio |
| ClickHouse | `profiles: ['full']` (`docker-compose.yml:256`) — needs `make docker-up-full` |
| Seeded EXECUTIVE | Wichai Ekachai, `+66811000001` |
| Seeded projects | **5**, not the mockup's 14 |
| Project coordinates | **none** — `schema.prisma` has no latitude/longitude; seed lat/lng lands on site_reports, issues, incidents, attendance only |
| ClickHouse tables that exist | `project_cost_daily` · `procurement_activity_daily` · `site_activity_daily` · `carbon_records` — **no task table** |
| Analytics endpoints that exist | `executive` · `pm/:projectId` · `cost-trend` · `procurement-trend` · `site-trend` |
| Carbon | `carbon-calculation.stub.ts` throws `NotImplementedException`; no controller exposes it |
| Charting / maps in `apps/mobile` | `react-native-svg` 15.15.4; **no** maps library |
| Highest ADR on disk | 096 — the three new ones below take the next free numbers |

---

## PART 0 — CPM engine + task dependencies (D5) — backend

- [x] **0.1** `projects.task_dependencies` in `schema.prisma` — `predecessor_task_id`, `successor_task_id`, `dependency_type` (FS/SS/FF/SF), `lag_days`, `tenant_id`, `project_id`, `created_at`, `modified_at`
- [x] **0.2** RLS policy on the new table — mandatory on every domain table from MVP (§7.7), not optional
- [x] **0.3** Migration **plus** its rollback script at `prisma/rollbacks/<migration-dir-name>.rollback.sql`, named exactly so `scripts/ci/check-migration-rollbacks.mjs` pairs them (QM-9)
- [x] **0.4** Cycle rejection — a dependency graph with a cycle has no critical path; reject on write with a typed error registered in `docs/api/error-codes.md` (QM-10)
- [x] **0.5** CPM service — forward pass (ES/EF), backward pass (LS/LF), total float; critical path = float 0. Durations from `planned_start`/`planned_end`
- [x] **0.6** Decide gate 3 per ESC-6, and leave `countIncompletePredecessors` correct either way
- [x] **0.7** A new ADR — the dependency model, its relationship to ADR-026, and what §10/§12 `DEPENDS_ON` means now. Written **before** anything cites it (Rule 29 blocks the reference otherwise)
- [x] **0.8** `GET /api/v1/projects/:projectId/critical-path` — versioned from `/api/v1` on the first commit (QM-2)
- [x] **0.9** `GET /api/v1/tasks/portfolio-summary` (D3) — tenant-wide overdue / due-this-week / blocked counts in one query, by D4's definitions
- [x] **0.10** RBAC on both: EXECUTIVE is already in `TASK_READ_ROLES`
- [x] **0.11** OpenAPI regenerated into `docs/api/`; the route-coverage gate green
- [x] **0.12** Seed real dependency rows for the 5 demo projects — without them the captured screen shows an empty critical path
- [x] **0.13** Unit + integration tests, 100% lines and branches (QM-1)
- [x] **0.14** **Deferred, and recorded as deferred:** no `DEPENDS_ON` edge is emitted to Neo4j. The KG is written only by `services/kg-ingestion-worker` from Kafka (graph/README.md), the edge is unimplemented there today, so not emitting is the status quo rather than a regression

## PART 1 — Navigation (D1)

- [x] **1.1** EXECUTIVE tab set in `roleTabs.ts` → `home` · `tasks` · `safety` · `more`, in table order (order is the bar's order)
- [x] **1.2** `tasks`, `more` and the safety route gain `CosRole.EXECUTIVE`; check no other role's bar moves as a side effect of the row order
- [x] **1.3** `portfolio`, `alerts`, `reports` get `href: null` in `MobileNav.tsx` **and** a `Breadcrumb` entry each
- [x] **1.4** They appear as drawer rows via `drawerLinks.ts`, and a More tile per D1
- [x] **1.5** The EXECUTIVE line in the `MobileNav.tsx` header comment rewritten with the date and the reason
- [x] **1.6** `lib/landingRoute.ts` still sends EXECUTIVE to Home
- [x] **1.7** Rule 37 — amend `20-ux-flow.md` §20.7.1, `32-implementation-specifications.md` §32.7 per-role table, `context/phases/phase-10-mobile-offline-engine.md` (both the EXEC block and the §Phase 10 summary line), same commit
- [x] **1.8** A new ADR — the navigation change and why the mockup overrode an enumerated spec nav

## PART 2 — Home (`01_home/01_ex_dashboard`)

- [x] **2.1** AI Executive Intelligence card — `<PortfolioInsight />` on the real `executive-summary` endpoint; cyan left rule, `bolt` glyph, uppercase label
- [x] **2.2** `Mitigation` / `Dismiss` — drawn, stating not usable yet (D2)
- [x] **2.3** `Active Projects` tile — count of `local_projects` with `status === 'ACTIVE'`
- [x] **2.4** `+2 this month` — mockup figure (D7)
- [x] **2.5** `Risk Alerts` tile with the `N Critical • M Warning` split, derived as `alerts.tsx` already derives severity
- [x] **2.6** Portfolio Budget hero — total / actual / remaining % / bar, all through `@cos/financial`, never `+`
- [x] **2.7** Project cards — status stripe, name, `Phase:` line, On Track / At Risk / Over Budget badge, variance
- [x] **2.8** Per-project `Sync Status` chip and the `Filter` control — mockup figures (D7)
- [x] **2.9** `Project Locations` section — mockup figure (D7); no coordinates and no maps library exist
- [x] **2.10** Rule 40 — a loading state per fetch, not one blanket spinner
- [x] **2.11** QM-3 — every string an i18n key, `en` + `th`
- [x] **2.12** testIDs for everything the capture script and the render tests address

## PART 3 — Tasks · Safety · More

- [x] **3.1** Tasks — overdue / due-this-week / blocked tiles from `GET /tasks/portfolio-summary` (D3 + D4)
- [x] **3.2** Tasks — AI Risk Alerts from `POST /ai/reports/delay-risk` with the model's own confidence; the `BIM + Site Logs` chip must not claim BIM data (Type A stub, §32.9)
- [x] **3.3** Tasks — Critical Path list from `GET /projects/:projectId/critical-path` (D5)
- [x] **3.4** Tasks — `ดูข้อมูล BIM` / `ปรับแผนด่วน` / `ดูรายละเอียด` per D2
- [x] **3.5** Safety — Safety Intelligence card; real half from `GET /safety/compliance` + `GET /safety/incidents` (tenant-wide, EXECUTIVE in `SAFETY_READ_ROLES`)
- [x] **3.6** Safety — `Active Incidents` tile with the severity breakdown (real data)
- [x] **3.7** Safety — 92% compliance, grade `A`, `+2.4%`, `Safe Man-Hours 1.2M`, the 6-month bar chart, per-project score and SECURE/MONITOR badge — mockup figures (D7); chart drawn with `react-native-svg`
- [x] **3.8** Safety — project ranking rows carrying real incident counts, and `View All …`
- [x] **3.9** More — `<PortfolioInsight />` under the drawing's `OS Intelligence` heading
- [x] **3.10** More — tiles onto real screens: portfolio, financial forecast, risk centre, vendor directory
- [x] **3.11** More — strategic BIM / carbon accounting / global site map tiles (D7)
- [x] **3.12** Rule 40 · QM-3 · testIDs for all three screens

## PART 4 — Drawer (D6) and tests

- [x] **4.1** Verify `NavigationDrawer.tsx` renders brand, avatar, name, role line, active-row highlight, separator, Settings, Support Center — change only what differs
- [x] **4.2** Assert the EXECUTIVE drawer ORDER in `drawerLinks.spec.ts` (the assertion whose absence hid the Safety Officer drift for nine days)
- [x] **4.3** QM-1 — 100% lines and branches on every file touched; a spec per screen, following `reports-exec.spec.tsx`
- [x] **4.4** `routeRegistry.spec.ts` green after the `ALL_TABS` churn
- [x] **4.5** `pnpm --filter mobile test` · `pnpm type-check` · `pnpm lint` all green
- [x] **4.6** `bash scripts/ci/verify-before-push.sh` before any push

## PART 5 — Android capture → `docs/screens/android/08-executive/`

- [x] **5.1** `make docker-up-full` — ClickHouse is `full`-profile and every exec screen needs `/analytics/executive`
- [x] **5.2** `make migrate` + `make seed`; confirm the EXECUTIVE user, the dependency rows and the ClickHouse rows exist
- [x] **5.3** Backend on `:3000` with `E2E_AUTH_BYPASS=true`
- [x] **5.4** `adb install -r` the debug APK; rebuild only if a native dependency changed
- [x] **5.5** Metro with `EXPO_PUBLIC_CAPTURE=1`; `adb reverse` 8081 / 3000 / 8090
- [x] **5.6** `apps/mobile/scripts/capture-android-executive.mjs` on the safety-officer pattern — Path A as `0811000001`, per-screen argument, `stitch-fullpage.py`
- [x] **5.7** One full-page PNG per screen into `docs/screens/android/08-executive/<NN>-<Tab>/`
- [x] **5.8** Home shot **last** — a dashboard photographed straight after sign-in races its own load
- [x] **5.9** A section per screen in `docs/screens/android/README.md`, in the voice and heading depth already there (QM-11)
- [x] **5.10** Rule 36 — `ls` every committed PNG and paste the output before any of this is called done

## PART 6 — Honesty obligations created by D7

- [x] **6.1** Every mockup figure lives in ONE module (`apps/mobile/src/lib/mockupFigures.ts`) with a header saying it holds values the platform cannot compute, so the set is greppable and removable in one change
- [x] **6.2** A new ADR — records D7, the ADR-085 conflict it overrides, and the condition for removing each figure
- [x] **6.3** `docs/screens/README.md` and `docs/screens/android/README.md` currently claim captures are "real logins and live API calls, not mockups" — amend so the claim stays true, naming which panels carry mockup figures
