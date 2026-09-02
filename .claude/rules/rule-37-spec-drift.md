---
paths:
  - "docs/specifications/**"
---

# Rule 37 — Spec / context drift

Indexed in: `context.md` §GLOBAL EXECUTION RULES

- Rule 37 — **After modifying any file in `docs/specifications/`**, immediately grep `context.md`, **the whole of `context/`** and **`.claude/rules/`** for the changed section number, technology name, or keyword:

  ```bash
  grep -rn "<changed-keyword>" context.md context/ .claude/rules/
  ```

  If grep finds a match → read that section, check consistency with the spec change, update in the same commit.
  If grep finds no match → no context update needed, proceed.
  Keywords to grep: section number (e.g. `§5.5`), technology name (e.g. `Cloudflare`), or the specific concept changed (e.g. `tenant_id`, `WAF`).
  `.claude/rules/` was added to the targets on 2026-09-02: those files restate the binding numbers of the Quality Mandates and of the master's cross-cutting specs so they load when a matching file is edited. A spec change that updated `context.md` and left a rule file behind would leave the stale copy as the one the agent actually sees. `scripts/ci/check-claude-rules-mirror.sh` checks that each rule file's named heading still exists; it cannot tell whether the numbers under it still agree — that is this rule's job.
  (prevents spec/context drift — root cause of WAF on-premise gap and JWT claim name inconsistency; agent had to be explicitly reminded both times)
