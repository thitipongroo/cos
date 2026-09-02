---
paths:
  - "**/package.json"
  - "pnpm-workspace.yaml"
  - "turbo.json"
  - "pnpm-lock.yaml"
---

# Rules 26, 27 & 28 — Dependency and lockfile sync

Indexed in: `context.md` §GLOBAL EXECUTION RULES

- Rule 26 — Before adding `import { X } from 'pkg'` to any source file, verify 'pkg' is in that package's own `package.json` (not root or another package). Add it if missing. (prevents missing runtime deps)

- Rule 27 — When adding any new script to any `package.json`, add the corresponding task to root `turbo.json` in the same commit. (prevents missing turbo tasks)

- Rule 28 — After changing anything that moves dependency resolution — `package.json`
  `dependencies`/`devDependencies`/`peerDependencies`/`optionalDependencies`/`resolutions`/`pnpm`, or
  `overrides:` in `pnpm-workspace.yaml` — run `pnpm install` and commit `pnpm-lock.yaml` in the same
  commit; CI `--frozen-lockfile` fails without it. NOT every `package.json` edit: `scripts`,
  `engines` and `packageManager` produce no lockfile diff, so there is nothing to commit (narrowed
  2026-08-08; full rationale in 00_master Rule 28). **Which lockfile: the nearest one ABOVE that
  `package.json`** — `apps/mobile` is its own workspace, so a mobile dependency needs
  `cd apps/mobile && pnpm install` and `apps/mobile/pnpm-lock.yaml`; everything else uses the root
  one. Enforced for every author by `scripts/ci/check-lockfile-staged.sh` in `.husky/pre-commit`
  (it names the expected lockfile) — the `.claude/hooks/` version only sees agent edits.
  (prevents CI lockfile failure)
