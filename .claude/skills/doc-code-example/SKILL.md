---
name: doc-code-example
description: Write runnable examples that show how to use an API, library or pattern correctly. Use alongside reference documentation, or when adoption is slow because nobody can see how the pieces fit.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
  - "Bash"
---

# Code Examples

An example is the part of the documentation people actually copy. Whatever it
teaches - including its mistakes - ends up in production.

## What makes one useful

- **Complete.** It runs as shown: imports, setup, teardown. An example with
  invisible prerequisites is a puzzle
- **Minimal.** Only what the point requires. Every extra line is something the
  reader has to decide whether they need
- **Realistic.** Real field names and plausible values. `foo` and `bar` teach
  nothing about where the values come from
- **Correct in its error handling.** An example that ignores the failure path
  teaches everyone who copies it to ignore it too

## Rules

- **Run every example before publishing**, and again when the API changes. Test
  them in CI where the language allows it
- **Never use a real credential**, even a revoked one. Placeholders must look
  like placeholders
- **Show the output** where it is not obvious
- **Two examples beat ten**: the common case, and the one non-obvious case that
  people get wrong

## Anti-patterns

Do not publish an example that catches and swallows every exception, or one that
disables verification to make it work. Both get copied verbatim into systems that
matter.

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins
— read it before applying anything here.

- `context.md` QM-11 — Documentation Standards
- QM-3 — Internationalization

QM-11 requires a README per module carrying a usage example. QM-3 applies to anything user-facing in that example — no
hardcoded strings, i18n keys in the `{domain}.{screen}.{element}` form.
