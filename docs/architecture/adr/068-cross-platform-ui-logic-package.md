# ADR-068: `@cos/ui-logic` — a zero-dependency package for client logic shared by web and mobile

**Date:** 2026-07-24
**Status:** Accepted
**Deciders:** Product Owner, Platform Engineering
**Tags:** architecture, mobile

---

## Context

`apps/web/src/lib/loadingState.ts` and `apps/mobile/src/lib/loadingState.ts`, and likewise the two
`lib/countries.ts`, carried byte-for-byte copies of a handful of pure, platform-agnostic functions:

- **loading-state math** (§32.7 / ADR-055): `clampProgress`, `isDeterminate`, `formatPercent`,
  `progressWidth`, `accessibilityLabel` — number/string logic with no platform dependency.
- **phone formatting** (§20.6.1 Path A): `toE164` and the `DEFAULT_COUNTRY_ISO2` constant.

The two platforms genuinely diverge elsewhere — mobile resolves a React Native token palette and a
`list` variant; web resolves Tailwind class names and a `table` variant; mobile carries inline
`FLAG_SVG` for `react-native-svg` and a `nationalDigits`/`countryFromRegion` model, web bundles flag
assets and parses BCP-47 via `countryFromLocale`. Only the pure core above is truly identical, and it
was the source of a jscpd clone (a 40-line and a 17-line block) across the two client trees.

`@cos/shared` already exists and its tsconfig path is even mapped into the mobile app, but it is **not
usable at runtime by mobile**: its `index.ts` exports Kafka SDK values (`KafkaProducer`,
`getSchemaRegistry`, …) whose transitive runtime dependencies are `kafkajs`, `ioredis`, `prom-client`
and `@kafkajs/confluent-schema-registry` — all Node-only. Importing it from the mobile app would make
Metro attempt to bundle those and fail (this is exactly the failure Rule 34 warns about). `@cos/shared`
can only be consumed by mobile via `import type`.

## Decision

Create a new **zero-runtime-dependency** package `@cos/ui-logic` holding only the pure, platform-agnostic
client logic, and have both clients consume it:

- `packages/@cos/ui-logic/src/loading-state.ts` — the five loading-state functions.
- `packages/@cos/ui-logic/src/phone.ts` — `toE164` and `DEFAULT_COUNTRY_ISO2`.

`apps/web/src/lib/loadingState.ts` / `countries.ts` and `apps/mobile/src/lib/loadingState.ts` /
`countries.ts` **re-export** the shared functions and keep only their platform-specific parts, so no
component import path changes. Web consumes it as `workspace:*`; mobile consumes it as a `file:`
dependency (the same mechanism it already uses for `@cos/types`), plus a `tsconfig.json` path mapping.

The package carries its own 100 %-line/branch Jest suite (Rule 35 / QM-1), because — unlike
`@cos/types`, which is types-only and therefore test-exempt — it contains executable logic.

## Rationale

- **Why a new package, not `@cos/shared`:** `@cos/shared` pulls Node-only runtime deps into its value
  exports; a mobile runtime import breaks Metro. A dedicated package with **no dependencies** is the
  only home that satisfies Rule 34 for all three targets (mobile / web / Node).
- **Why not `@cos/types`:** it is pure and mobile already consumes it, but it is a _types_ package
  (Rule 35 test-exempt). Adding executable logic there would blur that boundary and force test infra
  onto a package deliberately without it. Keeping types and logic separate keeps both exemptions honest.
- **Why not leave the duplication:** the clone is small (~57 lines) and — because the mobile tree is not
  in the jscpd CI path — not gated, so the cost is maintainability only. A single source of truth for
  the shared math is still worth the wiring: the two copies had already drifted in comments, and a fix
  to the clamp/E.164 logic previously had to be applied twice.

## Consequences

### Positive

- One tested implementation of the shared loading-state and E.164 logic; no more double-edit.
- The package is dependency-free, so it is safe for every current and future platform target.

### Negative

- Mobile now has a second `file:` dependency to keep built (`dist/`) before bundling, exactly like
  `@cos/types`. A stale/absent `dist/` surfaces only at Metro bundle time, not at `tsc`.
- Small wiring surface across `package.json` (web + mobile), `tsconfig.base.json`, mobile `tsconfig.json`
  and the lockfile.

### Neutral

- Platform-specific logic (RN palette, Tailwind classes, flag assets, region-vs-locale detection) stays
  in each app's `lib/` by design — this package is intentionally _only_ the identical core.

## References

- ADR-055 — LoadingState component / §32.7 loading states
- Rule 34 (`@cos/shared` cross-platform import safety), Rule 35 (executable shared package must be tested)
- `docs/specifications/32-implementation-specifications.md` §32.7; §20.6.1 (Path A phone / E.164)
