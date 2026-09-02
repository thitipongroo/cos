---
paths:
  - "packages/@cos/**"
---

# Rule 35 — Package test infrastructure

Indexed in: `context.md` §GLOBAL EXECUTION RULES

- Rule 35 — Every `@cos/*` package with executable logic (functions/methods with a body) must have: `jest.config.js`,
  `test:cov` script, `jest`+`ts-jest` in devDeps, unit tests, and CI coverage. Packages with only types/interfaces are
  exempt. (prevents untested logic in shared packages)
