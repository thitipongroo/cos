# Performance Attempts Register

Every performance change that was measured, **kept or reverted**.

A revert leaves nothing in git history. That absence is why the same idea that did not work gets
proposed again two quarters later, measured again, and reverted again. This file is the record that
makes a dead idea stay dead.

**Read this before proposing an optimisation.** If the idea is already here with a `reverted`
verdict, the burden is to explain what is different now — not to run it again.

Written by `qa-performance-verification`, step 5. Budgets live in QM-6, SLOs in QM-14; this file
holds attempts, not thresholds.

---

## How to add a row

One row per attempt, newest first. Both numbers, or the row is not evidence.

- **Baseline → Result** — the same metric, measured the same way, both values with units
- **Verdict** — `kept` or `reverted`. Anything inside run-to-run variance is `reverted`
- **Why** — for `reverted`, what the measurement showed; for `kept`, what moved and by how much

---

| Date | Area | Idea                       | Metric | Baseline → Result | Verdict | Why                                                              |
| ---- | ---- | -------------------------- | ------ | ----------------- | ------- | ---------------------------------------------------------------- |
| —    | —    | _no attempts recorded yet_ | —      | —                 | —       | The register was created on 2026-09-03; earlier work predates it |
