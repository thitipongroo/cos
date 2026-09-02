---
name: engineering-code-generator
description: Write new code from a stated requirement — read the surrounding code first, match its conventions, and produce something that compiles and is covered by tests. Use when asked to add a function, module, endpoint or component that does not exist yet.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
---

# Code Generator

New code is judged against the code beside it, not against a style guide.

## Before writing

1. Read the two or three nearest files that do a similar job. Note their naming,
   error handling, logging, and how they are tested
2. Find the project's dependency list. A package you have not confirmed is
   present is a package you may not import
3. Locate the test file that will cover this. If there is none, that file is part
   of the deliverable

## Writing

- Match the surrounding code's idiom, comment density and naming. A reader should
  not be able to tell where the existing file stops and yours begins
- Handle the error paths the neighbouring code handles. Silently dropping an
  error the rest of the module raises is a defect, not a simplification
- No placeholder bodies, no `TODO` left behind, no function that returns a
  hardcoded value to make a signature typecheck

## Before reporting

State what you added, where, and which test covers it. If any part is
unimplemented, name it — do not let a caller discover it at runtime.

## This project has not decided it

No Quality Mandate and no Rule in `context.md` covers coding conventions beyond the Never list — checked against
`context.md` and `context/00_master_construction_os.md`. The method above is the only written guidance in this
repository.

Two consequences. Follow it rather than improvising, since nothing else is written down. And if you settle a number, a
threshold or a procedure while doing the work, record it in `context.md` under a Quality Mandate or a Rule — not here. A
decision left in a skill file is invisible to Phase 19, to the hooks, and to anyone reading the mandates.
