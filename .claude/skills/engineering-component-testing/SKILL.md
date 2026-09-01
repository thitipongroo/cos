---
name: engineering-component-testing
description: Test a UI component in isolation — its rendering, its states, and its behaviour under interaction. Use when adding or changing a component, before wiring it into a screen.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
  - "Bash"
---

# Component Testing

A component test renders one component with controlled inputs and asserts what a
user would observe.

## What to assert

- **Rendering per state** — default, loading, empty, error, populated. A state
  with no test is a state nobody has looked at
- **Interaction** — what changes when it is clicked, typed into, submitted,
  dismissed
- **Contract with the parent** — the callbacks it fires, with what arguments
- **Accessibility** — it has a role and an accessible name, it is reachable by
  keyboard, and focus goes somewhere sensible after an action

## Rules

- Query the way a user finds things: by role, label or text. Reaching into
  internals couples the test to the implementation and it will break on rename
- Do not assert on class names or snapshot the entire tree. Both fail on changes
  that matter to no one and pass on changes that matter
- Provide the real providers the component needs — theme, i18n, router. A
  component that only renders under a stripped-down provider is not the component
  that ships

## Before reporting

Run them and paste the result. State which states you covered and which you did
not, so the gap is visible.
