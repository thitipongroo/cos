---
name: engineering-debugging
description: Find the cause of a defect — reproduce it, narrow it, prove the cause, then fix. Use with an error message, a stack trace, a failing test, or behaviour that diverges from what is expected.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Edit"
  - "Bash"
---

# Debugging

The goal is the cause, not a change that makes the symptom go away.

## Order of work

1. **Reproduce.** A defect you cannot trigger on demand cannot be confirmed
   fixed. Write the smallest input that shows it, and keep it as a test
2. **Narrow.** Bisect the space — by commit, by input, by code path. Each step
   should halve what is left, not add a print statement
3. **Prove the cause.** State it as a claim that could be false, then test that
   claim. "It fails because X is null here" is checkable; "something in the
   parser" is not
4. **Fix the cause.** Not the symptom, and not the place the symptom surfaced
5. **Confirm.** The reproduction from step 1 now passes, and the rest of the
   suite still does

## Rules

- Do not change more than one thing between observations
- A fix you cannot explain is a coincidence. Keep going
- If the cause is in code the task does not own, say so and stop — do not patch
  around it silently
- Keep the reproduction as a regression test. A defect that returns without a
  test is the same defect twice

## Before reporting

State the cause in one sentence, the fix, and the output of the run that proves
it. If anything remains unexplained, say what.
