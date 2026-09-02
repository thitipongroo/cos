---
paths:
  - "**/*.spec.ts"
  - "**/*.test.ts"
---

# Rule 30 — Async fake timer test pattern

Indexed in: `context.md` §GLOBAL EXECUTION RULES

- Rule 30 — For async functions using `setTimeout` internally (retry, poller, backoff), use `jest.useFakeTimers()` in `beforeEach`, `jest.useRealTimers()` in `afterEach`, and `await jest.runAllTimersAsync()` — NOT `jest.runAllTimers()`. (prevents test hangs on multi-step retry chains)
