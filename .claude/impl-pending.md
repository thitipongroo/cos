# Rule 38 — Implementation plan: Zod schemas + RHF + React Aria + dep cleanup + a11y §20.8

**Requested:** 2026-08-02
**Spec read line by line:** `docs/specifications/20-ux-flow.md §20.8` · `docs/specifications/30-testing-strategy.md §30.9`
· `docs/specifications/31-monitoring-observability.md §31.6` · `context.md` QM-1, QM-3, QM-4, QM-6, QM-11, QM-15
· `DESIGN.md §9` · `context/00_master_construction_os.md` Rules 26–29, 35, 37
**Status:** ALL 6 ESCALATIONS ANSWERED — awaiting `.claude/impl-approved`. No source file written yet.

---

## Decisions taken by the product owner

| # | Decision |
| - | -------- |
| 1.2 | Schemas live in a **new `packages/@cos/schemas`** package (shareable with mobile) |
| 2.3 | Migrate **all 18 form files** in this round |
| 2.4 | **Split the LCP budget: separate lab vs field thresholds** |
| 2.x | Form library = **react-hook-form** |
| 4B.1 | a11y primitives = **React Aria** |
| 4B.2 | Adopt **hard widgets + TextField/FieldError** (Dialog, Select, ComboBox, DatePicker, TextField, FieldError) |
| X.4 | **A QM-15 feature flag is required** |

## Measured baseline (all figures self-measured, not quoted)

| Fact | Value |
| ---- | ----- |
| `/login` script transfer size | 192,554 B (`lhci autorun`, 3 identical runs) |
| Bundle gate (blocks merge) | 256,000 B |
| **LCP measured locally** | **2,765 / 3,176 / 3,170 ms vs 2,500 gate — already failing** |
| react-aria-components 1.20.0 (6 components) | 35,155 B gz |
| `zod/mini` 4.4.3 | 4,165 B gz |
| react-hook-form 7.84.0 | 10,285 B gz |
| **Projected total** | 192,554 + 49,605 = **242,159 B → 13,841 B headroom** |
| RHF exposes `ref: RefCallBack` (React Aria needs it for focus management) | verified in `controller.d.ts` |
| TanStack Form 1.33.3 exposes no field ref | verified — 0 occurrences in its `.d.ts` |

---

## PART 1 — `@cos/schemas` + `zod/mini`

- [ ] **1.1** Create `packages/@cos/schemas` with `package.json` (`zod@^4.4.3` dependency), `tsconfig.json`
      extending the root base, and `src/index.ts`.
- [ ] **1.2** **Rule 35 obligations for the new package** (mandatory, it contains executable logic):
      `jest.config.js` with `coverageThreshold {lines:100, branches:100}`, a `test:cov` script,
      `jest` + `ts-jest` devDeps, unit tests covering every exported schema, and an entry in the CI
      coverage step (`.github/workflows/ci.yml`).
- [ ] **1.3** **Rule 27** — add matching `turbo.json` tasks for any new script in that package.
- [ ] **1.4** Import surface must be `zod/mini` (4,165 B), **never** the classic `zod` entry
      (64,996 B — alone it exceeds the 63,446 B headroom). Add a lint or test guard so a future
      `import { z } from 'zod'` in this package fails CI.
- [ ] **1.5** Encode the `DESIGN.md §9` rules: ~20 status vocabularies with exact enum values,
      `progress_percent` 0–100, `issue_severity` required when inspection is fail/conditional,
      budget 85% / 100% thresholds, risk score 1–25.
- [ ] **1.6** Validation messages are **i18n keys only** (QM-3). Add keys to `apps/web/src/i18n/en.json`
      **and** `th.json`; `scripts/readiness/check-i18n-completeness.sh` enforces parity.
- [ ] **1.7** Wire `@cos/schemas` into `apps/web` (`workspace:*`) and — since it is meant to be shared —
      into `apps/mobile` as a `file:` dependency, matching how `@cos/ui-logic` and `@cos/types` are linked
      (Metro does not follow symlinks; this is the established workaround).
- [ ] **1.8** `pnpm install`; commit `pnpm-lock.yaml` (Rule 28). Mobile has its own lockfile — run its
      install too.

## PART 2 — react-hook-form across all 18 forms

- [ ] **2.1** Add `react-hook-form@^7.84.0` + `@hookform/resolvers@^5.6.0` to `apps/web` (Rules 26, 28).
- [ ] **2.2** Use `standardSchemaResolver` (verified present); Zod 4.4.3 exposes `~standard` v1, so no
      zod-specific resolver is needed.
- [ ] **2.3** Migrate all 18 files (appendix). Keep existing HTML `required` / `type` attributes —
      they give the mobile keyboard and a pre-JS baseline. Do **not** add `noValidate`.
- [ ] **2.4** Wire RHF's `ref` into React Aria fields so focus moves to the first invalid field on
      submit — this is the reason RHF was chosen over TanStack Form and must be verified, not assumed.
- [ ] **2.5** Re-run `pnpm exec lhci autorun`; record the new `resource-summary:script:size` (Rule 36).

## PART 3 — Remove unused dependencies

- [ ] **3.1** Remove `zod` from `backend/package.json` — 0 imports in `backend/src`. Grep outside `src/`
      first, then prove with `pnpm --filter @cos/backend build` + `test:cov`.
- [ ] **3.2** Remove `zod` from `packages/@cos/validation/package.json` — it uses class-validator.
      QM-4 mandates class-validator for NestJS DTOs, so do **not** switch that package to zod.
- [ ] **3.3** **Keep** `zod` in `packages/@cos/config` — it validates env vars at boot.
- [ ] **3.4** `pnpm install` + commit lockfile (Rule 28).

## PART 4A — a11y automation (§20.8 acceptance criteria) — 0 KB runtime

- [ ] **4A.1** `eslint-plugin-jsx-a11y` in `eslint.config.mjs` for `apps/web/**/*.tsx`; CI fails on any
      error (§20.8 names the tool and requires 0 errors on merge).
- [ ] **4A.2** Add an `accessibility` category assertion to `apps/web/.lighthouserc.json`. **Set the
      threshold from a measured score**, as a ratchet — not an aspirational number.
- [ ] **4A.3** Add `@axe-core/playwright` to `tests/e2e/` so the 10 committed scenarios assert WCAG.
      Dev dependency only.
- [ ] **4A.4** CI grep gate for React Native `accessibilityLabel` + `accessibilityRole`.
      **Current state is 17/76 and 24/76 files — this gate fails on day one.** Sequence it: land the
      gate as a warning, close the gap, then flip to blocking. Do not flip it blocking first.
- [ ] **4A.5** `docs/evidence/contrast-report.md` — audit §32.7 tokens against 4.5:1 / 3:1 (measurement).
- [ ] **4A.6** `docs/evidence/screenreader-checklist.md` for the 5 critical flows named in §20.8.
- [ ] **4A.7** Verify layout at 200% font scale at 375pt; record the result.

## PART 4B — React Aria, selective

- [ ] **4B.1** Add `react-aria-components` for: **Dialog, Select, ComboBox, DatePicker, TextField,
      FieldError**. Style with §32.7 tokens — do not import any React Aria theme.
- [ ] **4B.2** DatePicker must use `BuddhistCalendar` from `@internationalized/date` for `th-TH`
      (QM-3 mandates Buddhist Era display; verified 2026 → 2569).
- [ ] **4B.3** Verify RTL against `ar-SA` (QM-3 requires testing every new UI component against it).
- [ ] **4B.4** Measure the real delta after integration — the 35,155 B figure is 6 components measured
      in isolation; Turbopack tree-shaking and shared-chunk placement may differ. Do not assume.
- [ ] **4B.5** None of this helps React Native. Mobile a11y stays on RN's own APIs per §20.8.

## PART 5 — LCP budget split (decision 2.4)

- [ ] **5.1** **Measure the CI baseline first.** `gh` is not authenticated here, so I could not confirm
      whether the Lighthouse gate currently passes. The lab threshold must come from a real
      `ubuntu-latest` run, not from my Mac measurement. Run the workflow, record the number.
- [ ] **5.2** Update `apps/web/.lighthouserc.json` to a lab-specific LCP threshold, keeping the
      **RUM p75 ≤ 2.5 s** SLO untouched in §31.6.
- [ ] **5.3** Update `docs/specifications/30-testing-strategy.md §30.9` — it currently states
      "**LCP ≤ 2.5 s**" for the lab gate, i.e. the same number as the field SLO. The split must be
      written there, with the rationale that lab and field measure different things.
- [ ] **5.4** **Rule 37** — after editing §30.9, grep `context.md` and
      `context/00_master_construction_os.md` for `LCP`, `Lighthouse`, `§30.9`, `Web Vitals` and
      reconcile. `context.md` QM-6 currently lists one LCP row citing both RUM and the lab gate.
- [ ] **5.5** The current budget numbers were **ratified by the product owner on 2026-07-04**
      (recorded in `lighthouse.yml`). The new lab number needs the same explicit ratification —
      I will propose a value from the measurement in 5.1 and will not set it unilaterally.

## PART 6 — QM-15 feature flag (decision X.4)

- [ ] **6.1** Register the flag in `docs/registers/feature-flag-registry.md` using the QM-15 naming convention
      `{stage}.{domain}.{feature}` — proposed `s1.web.client-validation`.
- [ ] **6.2** Implement via the existing server-evaluated path (ADR-049): backend `FeatureFlagService`
      + `GET /api/v1/flags`; clients never hold provider credentials. With `UNLEASH_URL` unset the
      registry default applies, so local dev needs no Unleash server.
- [ ] **6.3** The flag must be **togglable OFF within 60 seconds without a deploy** (QM-15) and must
      cleanly fall back to the current behaviour (HTML5-only validation).
- [ ] **6.4** Progressive rollout per QM-15: 1% → 10% → 50% → 100%, minimum 24 h per step.
- [ ] **6.5** Record it in `docs/registers/feature-flag-cleanup-backlog.md` — QM-15 requires removal within
      30 days of reaching 100%.

## Cross-cutting

- [ ] **X.1** Write a new ADR — `ADR-NNN — TO BE CREATED`, next free number 076 (Rule 29; 075 is the
      highest). It records: `zod/mini` over classic zod, RHF over TanStack Form (**with the field-`ref`
      evidence**), React Aria over Radix/Base UI/Ark UI/Headless UI, the LCP lab/field split, and every
      measured number behind those choices. QM-11 requires it.
- [ ] **X.2** Rule 26 — verify every new import is declared in that package's own `package.json`.
- [ ] **X.3** Rule 36 — each item closes only with `ls` / `grep` / test output shown.

---

## Risks I want on record before starting

1. **LCP is already failing locally and I cannot verify CI.** Part 5 sequences the measurement first,
   but if CI is also failing today, this work will surface an existing problem rather than cause it.
2. **The RN a11y grep gate fails on day one** (17/76, 24/76). 4A.4 lands it as a warning first.
3. **`@cos/schemas` triggers Rule 35** — 100% line + branch coverage on every schema, plus a CI entry.
   This is real work, not a formality.
4. **18-file migration is a large diff.** Review effort is significant and several pages change at once.
5. **The 35,155 B React Aria figure was measured in isolation.** Real cost after tree-shaking is
   unknown until built (4B.4).

## Appendix — the 18 files containing `<form>`

`app/login/page.tsx` · `app/login/otp/page.tsx` · `app/(app)/site/issues/new/page.tsx` ·
`app/(app)/site/reports/new/page.tsx` · `app/(app)/procurement/deliveries/new/page.tsx` ·
`app/(app)/procurement/requests/page.tsx` · `app/(app)/procurement/rfqs/page.tsx` ·
`app/(app)/finance/payments/page.tsx` · `app/(app)/safety/incidents/page.tsx` ·
`app/(app)/crm/leads/page.tsx` · `app/(app)/crm/opportunities/page.tsx` ·
`app/(app)/projects/page.tsx` · `app/(app)/projects/[id]/risks/page.tsx` ·
`app/(app)/settings/tenant/page.tsx` · `app/(app)/settings/users/page.tsx` ·
`app/admin/page.tsx` · `app/vendor/invoices/page.tsx` · `app/vendor/rfq/[token]/page.tsx`

---

## To approve

```bash
touch .claude/impl-approved
```

Per `.claude/hooks/rule-38-check-approval.sh` the agent must not create that file — it is the human gate.
