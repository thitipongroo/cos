---
paths:
  - "**/jest.config.js"
  - "**/jest.*.config.js"
  - "**/package.json"
---

# Rule 32 — Single source of truth for jest config

Indexed in: `context.md` §GLOBAL EXECUTION RULES

- Rule 32 — `jest.config.js` is the single source of truth per package. Never add a `"jest"` key to `package.json` when `jest.config.js` exists in the same package. (prevents duplicate/conflicting jest config)
