---
paths:
  - "**/*.md"
  - "**/*.ts"
  - "**/*.tsx"
---

# Rule 29 — ADR reference verification

Indexed in: `context.md` §GLOBAL EXECUTION RULES

- Rule 29 — Before writing `(see ADR-NNN)` in any spec or code comment, verify `docs/architecture/adr/NNN-*.md` exists.
  Create the ADR first if it does not. (prevents dangling ADR references)
