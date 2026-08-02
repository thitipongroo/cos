# ADR-076: Client-side form validation via zod/mini + react-hook-form, with React Aria used per route

**Date:** 2026-08-03
**Status:** Accepted
**Deciders:** Product owner, Engineering Lead
**Tags:** frontend, architecture, accessibility

---

## Context

`apps/web` had no client-side form validation. All eighteen forms held their fields in `useState`,
relied on the browser's `required` attribute, and disabled the submit button until the fields the
page happened to check were non-empty. Three consequences followed, and all three were measured
rather than assumed:

1. **No programmatic labels.** The app contained 14 `<label>` elements and **zero** `htmlFor`
   attributes against 33 `placeholder=` props. Most fields therefore had no accessible name, and a
   placeholder disappears the moment the user types — leaving the field unnamed mid-entry. Spec
   §20.8 requires WCAG 2.2 AA, whose SC 4.1.2 makes an accessible name mandatory.
2. **Errors were invisible to assistive technology.** A disabled submit button is the only signal a
   form gave when a rule was unmet; a screen-reader user got no statement of what was wrong.
3. **Validation rules existed in three places** — the browser attribute, the `disabled` expression,
   and the server DTO — with nothing keeping them in agreement.

QM-4 mandates `class-validator` on NestJS DTOs and that does not change: the server remains the only
authority. This ADR is about stopping bad input earlier and making the failure legible.

## Decision

### 1. Schemas live in a shared package, written against `zod/mini`

`packages/@cos/schemas` holds every form rule, consumed by `apps/web` (`workspace:*`) and available
to `apps/mobile` (`file:` — Metro does not follow symlinks).

**`zod/mini`, never the classic `zod` entry.** Measured on this package: classic is 64,996 B
gzipped, mini is 4,165 B. Classic alone would have consumed the entire `/login` bundle headroom.
Because mini drops method chaining, rules read `z.string().check(z.minLength(1))` rather than
`z.string().min(1)` — the latter throws. `src/__tests__/bundle-guards.spec.ts` asserts the import
specifier so the cheaper entry cannot be swapped back by accident.

**Dual CJS/ESM build, with `exports.import` pointing at the ESM output.** Identical source measured
**69,352 B gzipped as CommonJS** against **6,905 B as ESM**, because bundlers cannot tree-shake
zod's `.cjs` files.

Relative imports in the source are **extensionless** (`./enums`, not `./enums.js`), matching every
other `@cos/*` package. Explicit `.js` extensions were tried first — they make the emitted
`dist/esm` loadable by Node's own ESM loader — and had to be reverted: `tsconfig.base.json` maps
`@cos/schemas` to `src/index.ts`, so Turbopack bundles the TypeScript source directly and cannot
resolve `./enums.js` to `./enums.ts` the way `tsc` does. The build failed with 39 module-resolution
errors. Nothing consumes this package from Node ESM — `apps/web` goes through Turbopack and
`apps/mobile` through Metro, and both resolve extensionless specifiers — so the extensions bought
nothing and cost the build.

**Every message is an i18n key** (`validation.required`, never "This field is required"), resolved
by the consumer. QM-3 forbids literal copy in shared code, and the same schema serves th and en.
That includes enums: zod's default enum rejection is the English string "Invalid input", so every
`z.enum` sets `error: 'validation.invalidOption'` explicitly.

### 2. Every form goes through one hook

`apps/web/src/lib/forms.ts` exports `useValidatedForm`. No page calls `useForm` directly.

```ts
resolver: clientValidation ? standardSchemaResolver(schema) : undefined;
```

`mode: 'onTouched'` — validating on every keystroke announces an error while the user is still
typing the first character; validating only on submit makes a site engineer fill a long form before
learning the first field was wrong.

### 3. react-hook-form, not TanStack Form

RHF is uncontrolled by default, so typing in one field does not re-render the form — the property
that matters most on the data-dense pages. Its `shouldFocusError` moves focus to the first invalid
field on a failed submit, which is what makes the accessibility story work, and it needs the field
components to forward refs (they do). `@hookform/resolvers/standard-schema` connects it to any
Standard Schema, so the schema package is not coupled to the form library.

### 4. React Aria per route, not app-wide

Measured with esbuild against the same externals:

| Import set                                   | Gzipped  |
| -------------------------------------------- | -------- |
| `I18nProvider` only                          | 1,194 B  |
| `TextField` + `Label` + `Input` + `TextArea` | 11,706 B |
| ...plus `Select` (overlay + collections)     | 58,430 B |
| ...plus `ComboBox`                           | 66,880 B |
| ...plus `DatePicker`                         | 99,666 B |

`Select` alone costs **+46,724 B**, and buys control over how the open dropdown looks — nothing
more. A native `<select>` with an associated `<label>` is fully AA conformant: the browser supplies
role, keyboard contract, type-ahead and option count, and on mobile it opens the platform picker a
site engineer already knows. So `NativeSelectField` (**569 B**) is the default, and React Aria's
`SelectField` / `ComboBoxField` are available for a screen that genuinely needs the styled list.

`DateField` is the exception where the cost buys a requirement rather than a preference: QM-3
requires Buddhist Era, and `<input type="date">` renders the OS picker — always Gregorian,
unstyleable. ICU resolves `th-TH` to the `buddhist` calendar, so the era follows from the locale
rather than being hardcoded (asserted in `src/lib/__tests__/locale.spec.ts`).

**Each field is its own module and there is no barrel.** With all four in one `fields.tsx`,
importing any single one cost **99,666 B** — esbuild cannot prove a top-level `forwardRef(...)` call
is side-effect-free, so it kept every field in the chunk. Split, a text-only form pays **11,991 B**.

**No Dialog.** `apps/web` renders no modal anywhere — zero `role="dialog"`, zero `aria-modal`, zero
portals. A Dialog wrapper would be unused, untested code.

### 5. Rollout behind `s1.web.client-validation`, fail-closed

Registered in `docs/feature-flags/registry.md`, default **OFF**. Unlike the retrofit kill-switches,
which are fail-open, this one is fail-closed: with the flag off the resolver is `undefined`, forms
submit whatever the user typed, and `class-validator` rejects bad input server-side — the behaviour
that shipped before this existed. Degrading to the known-good path is safer than enabling
half-rolled-out validation.

Kill-switch budget: the backend polls Unleash every 15s, the client refetches `GET /api/v1/flags`
every 30s — 45s worst case, inside the QM-15 60-second bound. Asserted in
`src/lib/__tests__/flags.spec.ts`.

## Consequences

### Positive

- Every field has a programmatic label, and every error is announced. The Lighthouse accessibility
  category on `/login` went **0.96 → 1.00** with zero failing audits, stable across three runs.
- One rule set, one kill switch. Flipping the flag off disables validation on all eighteen forms.
- Errors that were previously silent now speak: the goods-receipt form used to `return` from its
  submit handler when no quantities were entered — the button did nothing and said nothing.

### Negative

- `/login` grew from **194,995 B** to **223,086 B** script transfer size. 32,914 B of headroom
  remains against the 256,000 B budget, but the margin is thinner than before.
- `eslint-plugin-jsx-a11y@6.10.2` declares a peer range of eslint ^3–^9 while this repo runs
  eslint 10. 6.10.2 is the latest published version, so there is no eslint-10 release to move to; it
  is installed over the warning because it demonstrably runs. `npx eslint 'apps/web/src/**/*.tsx'`
  is the check that this stays true after an eslint upgrade.
- Contributors must know to import `../../components/form/TextInputField` and not add a barrel.
  The README in that directory says so, but nothing enforces it.

### Risks accepted

- **The schemas can drift from the API.** They already had: three of the first five were written
  from DESIGN.md prose rather than the request types, and would have rejected every payload their
  form sends. `scripts/readiness/check-schema-contract.sh` now compares field names for all eighteen
  pairs in CI, which is the mitigation — the risk it cannot cover is a field whose _type_ changes
  while its name does not.
- **The mobile app does not use this yet.** `@cos/schemas` is wired into `apps/mobile`'s
  `package.json` but no React Native screen consumes it. The rules exist to be shared; the sharing
  has not happened.

## Alternatives considered

**Classic `zod`** — 64,996 B gzipped against a 256,000 B route budget with 194,995 B already spent.
Rejected on measurement, not preference.

**TanStack Form** — its differentiator is a framework-agnostic core, which this project cannot use:
`apps/mobile` is React Native, which react-hook-form supports directly. Rejected because it would
have cost a rewrite of the mature RHF ecosystem integration for no advantage here.

**React Aria everywhere** — 99,666 B on every form route, which puts a form page at roughly 295 KB
against a 256 KB budget. Rejected as over budget; per-route selection was the product-owner decision
of 2026-08-03.

**Radix / Base UI / Headless UI** — Base UI has no stable release (14 published versions, all
pre-release, checked 2026-08-02). React Aria was chosen for its `@internationalized/date` Buddhist
calendar support, which none of the others provide.

**Keeping validation server-side only** — the status quo. Rejected because it cannot satisfy §20.8:
a server round trip does not give a field an accessible name, and a 400 response does not move focus
to the field that caused it.

## References

- Spec §20.8 Accessibility (WCAG 2.2 AA) — the acceptance criteria this work is measured against
- Spec §30.9 — the Lighthouse gate, now including `categories:accessibility` ≥ 1.0
- Spec §32.7 — the design tokens audited in `docs/a11y/contrast-report.md`
- ADR-049 — Unleash feature flags, server-evaluated delivery
- ADR-055 — the `apps/web` unit-test lane these consumers are covered by
- QM-1 (100% line + branch), QM-3 (i18n keys, Buddhist Era), QM-4 (class-validator), QM-15 (flags)
- `apps/web/src/components/form/README.md` — which control to use, with the measured costs
