---
name: devops-infrastructure
description: Define and change infrastructure as code - networks, compute, storage, and the state that describes them. Use when provisioning an environment, or when changes are being made by hand.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
  - "Bash"
---

# Infrastructure

Everything is code, in version control, reviewed. A change made by hand exists
only in someone's memory and disappears with the next apply.

## Rules

- **No manual change, ever** - not even to fix an incident. If you must, make it
  and then bring the code back into line immediately, or the next apply reverts
  the fix
- **Plan before apply**, and read the plan. The destroy line is the one that
  matters and it is easy to scroll past
- **State is precious** - stored remotely, versioned, locked, backed up. Lost
  state means infrastructure that exists but cannot be managed
- **One definition, many environments**, parameterised. Environments that drift
  produce bugs that only appear in production

## Structure

Small modules with clear inputs and outputs. A single file describing everything
becomes a file nobody dares change.

## Safety

- Separate credentials and separate state per environment
- Protect anything stateful against accidental deletion - database, bucket,
  volume - at the provider level, not only in code
- Tag everything with owner, environment and purpose. Untagged resources are
  never cleaned up because nobody knows what they are

## Before applying to production

Apply to a lower environment first. Read the plan out loud if it deletes
anything. Know how to restore what you are about to change.

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins
— read it before applying anything here.

- `context.md` QM-13 — Multi-Region Architecture
- QM-18 — Connection Pool Management
- spec §8.8

QM-18 makes PgBouncer mandatory in transaction mode and prohibits session and statement mode, with the baseline pool
numbers. QM-13 sets the region rules — primary `ap-southeast-7`, DR `ap-southeast-1`, and no region hardcoded in
business logic.
