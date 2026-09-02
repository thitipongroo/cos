---
name: qa-compatibility-testing
description: Verify the product works across the browsers, devices, operating systems and versions it claims to support. Use before a release, or when adopting a feature with uneven platform support.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Bash"
---

# Compatibility Testing

Test what is supported, and know where that list came from. A support matrix
nobody derived from real usage is a guess that costs real time.

## Build the matrix

- Take the platforms from actual usage data, not from a wish list
- State the version policy explicitly - latest two, or a named minimum
- Rank the combinations by user count. Depth on the top few beats one pass over
  everything

## What breaks in practice

- **Layout** at the extremes: smallest supported width, largest text setting,
  longest translated string
- **Features with uneven support** - APIs, formats, codecs. Check the fallback
  actually runs, not just that it exists
- **Input differences** - touch versus pointer, on-screen keyboards, back gestures
- **Locale** - date, number and currency formatting, right-to-left layout
- **Older versions** of the same platform, which is where most real failures live

## Rules

- **Real devices for the top platforms.** Emulators miss input, performance and
  font behaviour
- **Record the exact version** on every result. "Chrome" is not a version
- **A failure outside the supported matrix is a note, not a defect** - unless it
  reveals the matrix is wrong

## Reporting

A grid of platform against result, and every failure with its version, the
symptom and a screenshot.

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins
— read it before applying anything here.

- `context.md` QM-3 — Internationalization
- QM-9 — Backward Compatibility

QM-9 fixes the support window: the backend supports the previous two major mobile versions. QM-3 adds the locale
dimension — RTL, Buddhist Era display, and the `ar-SA` check every new UI component must pass.
