---
name: doc-user-guide
description: Write task-based documentation for people using the product - how to accomplish something, start to finish. Use when a feature ships, or when support answers the same question repeatedly.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
---

# User Guide

Organise by what the reader is trying to do, never by how the product is built.
Nobody opens documentation wanting to learn about your architecture.

## Structure a task

1. **Title names the goal** in the reader's words: *Export invoices to CSV*
2. **State the prerequisites** - permissions, setup, anything that must exist
   first. Discovering a missing prerequisite at step 6 sends the reader away
3. **Numbered steps**, one action each. What to click, what to type, what happens
4. **The result** - how they know it worked
5. **What can go wrong**, and what to do about each

## Rules

- **Screenshots for orientation, words for instruction.** A screenshot goes stale
  every release; the sentence beside it does not
- **Match the interface exactly.** If the button says *Save changes*, the guide
  says *Save changes* - not *save your work*
- **One task per page.** A page covering four tasks is found by nobody looking
  for the third
- **No forward references.** "As described later" means the reader has to jump

## Keep it true

A guide that describes last release is worse than no guide - it teaches the wrong
thing confidently. Tie the update to the change that caused it, and record when
the page was last verified against the running product.
