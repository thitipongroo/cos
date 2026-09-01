---
name: engineering-mock
description: Replace a collaborator with a controlled stand-in so a unit can be tested in isolation. Use when a dependency is slow, non-deterministic, or has side effects a test must not cause.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
---

# Mocking

A mock exists to make a unit testable. Every mock is also a claim about how the
real collaborator behaves — and a wrong claim produces a green test over broken
code.

## When to mock

- The dependency is slow, networked, or costs money
- It is non-deterministic — clock, randomness, external state
- The test needs a failure the real one will not produce on demand

## When not to mock

- The dependency is cheap and deterministic. Use the real one
- You are mocking the unit under test's own internals. That test asserts your
  implementation, not your behaviour, and blocks every refactor
- You would need to mock four collaborators to write one test. That is the design
  telling you something

## Rules

- **Mock the boundary you own**, not the third-party library three layers down
- **Keep the mock honest.** It must return the shapes the real thing returns,
  including its errors. When the real contract changes, the mock is part of the
  change
- **Assert on outcome, not on calls** — unless the call is the observable
  behaviour, as with a message being published
- **Reset between tests.** A mock carrying state from the previous test is how
  order-dependent suites are born

## Before reporting

Say which collaborators are mocked and which are real, so a reader knows what the
test does and does not prove.
