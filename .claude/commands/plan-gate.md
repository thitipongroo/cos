---
description: Run the Rule 38 human gate — extract the spec line by line into .claude/impl-pending.md and stop for product owner approval
argument-hint: [spec path and section, or a description of the work]
allowed-tools:
  - Read
  - Glob
  - Grep
  - Skill
  - Write
---

# Rule 38 Gate

Target: `$ARGUMENTS`

Produce the complete obligation list for this work in `.claude/impl-pending.md`
and **stop**. This command never writes implementation code — approval is the
human gate, and nothing you do in this turn can satisfy it.

## Step 1 — Load the discipline

Invoke the `spec-reading` skill and follow it. Where it says `BLOCKED`, this
project's tag is `NEEDS_ESCALATION` — see Step 3 for the two definitions that
qualify.

## Step 2 — Read the spec line by line, yourself

Read the Generate / Deliverables / Constraints section with the Read tool, in
chunks if long.

**Do not delegate this to a subagent.** `CLAUDE.md` records why: an Explore
subagent extracting Phase 21 items missed the line `"IoT platform RESOLVED —
EMQX"` on the same page and produced three wrong escalations. A summary drops the
item phrased unlike its neighbours, and that is reliably the one that mattered.

Record every source you read with its section or line range. That record goes in
the plan.

## Step 3 — One task per line item, tagged

Rule 38 step 2 calls for a `TodoWrite` list, one entry per line item. Build it if
the tool is available in the session — it keeps the list visible while you work.
It is not a substitute for the file: `TodoWrite` disappears with the session, and
`.claude/impl-pending.md` is what the product owner approves and what
`rule-38-check-approval.sh` watches. When the tool is unavailable, the file alone
is sufficient.

| Tag | Meaning | Action |
|---|---|---|
| `READY` | Everything needed is present in the spec or context files | Implement after approval |
| `NEEDS_ESCALATION: UNSPECIFIED` | Absent from **all** spec and context files | STOP — no stub, no implementation |
| `NEEDS_ESCALATION: AWAITING_DECISION` | A pending decision marker in context files 05–11 | BLOCK until the product owner answers |

Before tagging an escalation, `Grep` the whole repository for the term and read
the hits. These do **not** qualify, per `CLAUDE.md`:

- Infrastructure credentials — config, not decisions
- A technology already resolved anywhere in `docs/specifications/` or `context/`
- Anything the spec marks `RESOLVED` or names a specific technology for

A wrong escalation costs more than a missing one — it sends a question back that
the spec already answered.

## Step 4 — Write `.claude/impl-pending.md`

Match the format this project already uses:

```markdown
# Rule 38 — Implementation plan: <short title>

**Requested:** <YYYY-MM-DD>
**Spec read line by line:** `docs/specifications/<file> §<n>` · `context.md` QM-<n>
**Status:** <N escalations open | all escalations answered> — awaiting `.claude/impl-approved`. No source file written yet.

---

## Decisions taken by the product owner

| # | Decision |
| - | -------- |

## Measured baseline (all figures self-measured, not quoted)

| Fact | Value |
| ---- | ----- |

## PART 1 — <area>

- [ ] **1.1** <obligation, as the spec words it>
- [ ] **1.2** <obligation>
```

Every figure in the baseline table is one you measured in this session with a
command. Never a number recalled, quoted from a report, or estimated.

Only `.claude/impl-pending.md` may be written by this command. Nothing else.

**Every checkbox is written unticked, and this command never ticks one.** Rule 38
step 5: a task is complete only when it has filesystem evidence — `ls` / `grep` /
`cat` output. That evidence is produced by `/verify`, and the box is ticked only
after a person confirms the result. A box ticked at planning time is a claim
about work that has not happened yet.

## Step 5 — Present and stop

Show the list in chat with the counts (`N READY`, `M NEEDS_ESCALATION`), then
stop.

Approval is the product owner creating the file:

```bash
touch .claude/impl-approved
```

**You must not create it.** `.claude/hooks/rule-38-check-approval.sh` exists to
block source writes until it appears; an agent creating it defeats the only human
gate in the workflow.

### The marker has to name the plan it approved

Since 2026-09-08 the hook does more than test that the file exists, because
presence alone cannot say WHICH plan was approved — and a marker outlived its
plan three rounds running, leaving the gate open for a list nobody had read.

- **`touch`** still works and is still the documented gesture. An empty marker is
  checked by TIME: it must be at least as new as `.claude/impl-pending.md`. A
  marker created before the plan it supposedly approves is refused as stale.
- **Naming the plan exactly** is the stronger form, for anyone who wants it:

  ```bash
  sha256sum .claude/impl-pending.md | cut -d ' ' -f 1 > .claude/impl-approved
  ```

  Content then decides instead of time, so the plan can be re-saved or have its
  boxes ticked afterwards without needing re-approval — but editing its words
  stops the hash matching, which is the right answer.

Either way the hook fails **closed**: an unverifiable marker refuses the write.

If `.claude/impl-approved` already exists from a previous round, say so — it is
not approval of the plan you just wrote, and the hook will now refuse rather than
pass. Ask the product owner to remove both files before this plan is considered.
