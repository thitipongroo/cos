---
name: engineering-code-reviewer
description: Review a diff or file for defects that would survive the test suite — wrong behaviour, unhandled edge cases, security and concurrency errors. Use before merging, or when asked whether a change is safe.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Bash"
---

# Code Reviewer

Review for what breaks in production, not for what a linter already catches.

## What to look for, in order

1. **Correctness** — does it do what the change claims, for the inputs it will
   actually receive? Off-by-one, wrong operator, inverted condition
2. **Edge cases** — empty, null, zero, very large, duplicate, out of order,
   concurrent. Which of these reaches this code, and what happens
3. **Error handling** — a swallowed exception, an unchecked return, a partial
   write with no rollback
4. **Security** — untrusted input reaching a query, a path, a shell, or a
   template. Secrets in code or logs
5. **Resource use** — a query inside a loop, an unbounded read, a handle that is
   never closed

Formatting, naming preference and style are not review findings unless the
project enforces them.

## Reporting a finding

Every finding needs three parts, or it is noise:

- **Where** — `file:line`
- **What goes wrong** — the concrete input or state that triggers it
- **Why it matters** — the observable consequence

Rank by severity. Say plainly when a diff is clean; a review that manufactures
findings to look thorough costs more than it saves.

## This project has not decided it

No Quality Mandate and no Rule in `context.md` covers code review — checked against `context.md` and
`context/00_master_construction_os.md`. The method above is the only written guidance in this repository.

Two consequences. Follow it rather than improvising, since nothing else is written down. And if you settle a number, a
threshold or a procedure while doing the work, record it in `context.md` under a Quality Mandate or a Rule — not here. A
decision left in a skill file is invisible to Phase 19, to the hooks, and to anyone reading the mandates.
