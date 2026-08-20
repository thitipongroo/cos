# Runbook — Mobile E2E (Detox) on CI

The `mobile-e2e-tests` job in `.github/workflows/ci.yml` runs two Detox specs against a staging
backend on an Android emulator. **It has never executed.** It is gated to the `staging` branch and
needs six repository secrets that do not exist yet, so its first real run will also be its first
verification.

This runbook is what to create, what each value has to be, and what is known to be broken before you
start — so the first run costs one hour rather than three.

---

## What is already verified

`apps/mobile/src/lib/__tests__/detoxCiWiring.spec.ts` runs in the ordinary logic suite and checks,
without an emulator, that the parts refer to each other: the spec files the job names exist, the AVD
name the workflow exports equals the one it asks the runner to create, the Detox configuration is one
`.detoxrc.js` declares, the build steps carry `EXPO_PUBLIC_E2E`, and the secrets cover exactly the
variables the specs read — no more, no fewer.

It cannot check that the backend answers, that the users exist, or that the emulator boots. That is
what this runbook is for.

---

## Step 1 — Create the six secrets

Repository → Settings → Secrets and variables → Actions → New repository secret.

| Secret                   | What it must contain                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `STAGING_MOBILE_API_URL` | The staging API base, e.g. `https://api.staging.example/api/v1`. Used **twice**: baked into the APK as `EXPO_PUBLIC_API_URL` at build time, and passed to the test runner as `E2E_API_URL` for the direct call in the conflict spec. |
| `E2E_INSPECTOR_PHONE`    | E.164 phone of a **SAFETY_OFFICER** on staging. Not any inspector — `inspections` is that role's tab and no other's (`src/lib/roleTabs.ts`), so a SITE_ENGINEER account fails at the second test with no tab to open.                |
| `E2E_USER_A_PHONE`       | E.164 phone of a user who is assigned the task in `E2E_TEST_TASK_ID` and can update its progress.                                                                                                                                    |
| `E2E_TEST_OTP`           | An OTP the staging auth path accepts for these numbers. All three specs log in through Path A (SMS OTP), so a real one-time code cannot work — staging needs a fixed test OTP for these accounts.                                    |
| `E2E_API_TOKEN`          | A bearer token that may `POST /api/v1/sync/resolve`. It plays **User B** — the second device in the conflict test, applied over HTTP rather than on a second emulator.                                                               |
| `E2E_TEST_TASK_ID`       | The `task_id` of a task on staging whose `progress_percent` the suite may overwrite. The test drives it to 40 from the device and 70 over the API, and asserts Max-wins leaves **70**. Not a task anyone else is reading.            |

**Every one of them has a working local default in the spec, and that is the trap.** A missing secret
does not fail the job — it runs the suite against `+66800000001` or `123456`, and the failure arrives
as a login timeout with nothing pointing at the cause. If a login step times out, check the secret
before you check the backend.

## Step 2 — Prepare the staging data

1. Two accounts with the roles above, both reachable by SMS OTP with `E2E_TEST_OTP`.
2. `E2E_USER_A_PHONE` assigned to `E2E_TEST_TASK_ID`, with the task's `progress_percent` **below 40**
   at the start of a run — the assertion is that Max-wins settles on 70, and a task already at 80
   passes for the wrong reason.
3. At least one safety checklist on the inspector's project, otherwise `inspection-item` never
   appears and the inspection spec's guarded blocks skip silently.

## Step 3 — Run it

The job is `if: github.ref == 'refs/heads/staging'` and `needs: [update-gitops]`, so it runs on a
staging deploy. There is no manual trigger — add `workflow_dispatch` if you want one.

Budget an hour: `timeout-minutes: 60`, and most of it is the emulator and the Gradle build.

## Step 4 — When it fails

Artefacts upload on failure to `apps/mobile/artifacts/` (`--record-logs failing`). Read those before
re-running; a second identical hour tells you nothing the first did not.

| Symptom                               | Look at                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hangs waiting for a device            | The AVD name. The workflow creates `test` and exports `DETOX_AVD_NAME: test`; `detoxCiWiring.spec.ts` asserts they match, so if that test passes, the name is not the problem. |
| Login times out at `otp-input`        | `E2E_TEST_OTP`, or the account does not exist — the spec fell back to its default.                                                                                             |
| Login succeeds, then no tab to open   | The role on that phone number. Check it against the table above.                                                                                                               |
| Deep links do nothing (never offline) | `EXPO_PUBLIC_E2E` on the BUILD steps. It is inlined into the bundle at build time, not read at runtime, so setting it only on the run step is too late.                        |
| Conflict test settles on 40, not 70   | `E2E_API_TOKEN` scope, or the task was already above 70.                                                                                                                       |

---

## Retired — offline check-in

`e2e/offline-checkin.spec.ts` used to be the job's first spec. It drove `check-in-button`, which no
component in the app renders: self check-in was removed from the product on 2026-08-09 (product-owner
decision, recorded in `src/components/home/FieldHome.tsx`). Two of its tests waited on that button
unguarded and would have failed this job; two more sat behind `isVisible` and passed having checked
nothing.

The product owner retired the spec with the feature on 2026-08-21, and `E2E_WORKER_PHONE` went with
it — no remaining spec reads it. The offline queue-and-sync path it covered is exercised by
`offline-inspection.spec.ts`.

`detoxCiWiring.spec.ts` keeps a `KNOWN_MISSING` list, now empty, that fails if a driven control ever
goes missing again.

**Still open, and NOT settled by that:** `docs/specifications/21-mvp-scope.md` places daily
check-in/check-out inside MVP workforce scope, and the app has no way to check in. Retiring the E2E
scenario settled the test, not the scope — see the note in that file.

## References

- `.github/workflows/ci.yml` → `mobile-e2e-tests`
- `apps/mobile/.detoxrc.js`
- `apps/mobile/e2e/helpers.ts` — `setNetworkConnected`, `resetSession`, and the `cos://e2e/*` deep
  links behind them (wired in `src/app/_layout.tsx`, inert unless `EXPO_PUBLIC_E2E === '1'`)
- `apps/mobile/src/lib/__tests__/detoxCiWiring.spec.ts` — the static checks
- `apps/mobile/src/app/__tests__/root-layout-e2e.spec.tsx` — the deep links' own tests
