---
description: Run the Rule 36 verification gate — prove every obligation on disk with a command, and report what actually passed
argument-hint: [spec path and section, or blank to use .claude/impl-pending.md]
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Skill
  - Edit
---

# Rule 36 Gate

Target: `$ARGUMENTS` (defaults to `.claude/impl-pending.md` if it exists)

Establish, item by item, whether the work is actually done. Rule 36 states the
standard: read the spec section line by line, run `ls`/`grep`/`cat` for **each**
item, show the actual output, and only then summarize.

> "I verified X" ≠ "everything is complete."

## Step 1 — Recover the full obligation list

Invoke the `spec-reading` skill, then read the target line by line and rebuild
the list from the source text.

Rebuild it from the spec, not from the conversation and not from the checked
boxes in `.claude/impl-pending.md`. A ticked box is a claim to be tested. A list
trimmed earlier in a session is a list that already lost items.

## Step 2 — One command per item

Every item gets a command that would fail if the item were incomplete:

```bash
ls -la <path>
```

```bash
grep -rn "<symbol>" <path>
```

Rules that decide the verdict:

- The command's real output goes in the report. No output, no pass
- A file existing does not prove its contents — check what the item requires
- A constraint item ("must not use X") is proved by a search returning nothing,
  and that empty result must be shown
- If a check cannot run here, the verdict is `UNVERIFIED` with the reason.
  `UNVERIFIED` is never rounded up to `PASS`

Before concluding something is absent, widen the search and try the other
spellings it might use — then say which patterns you tried.

## Step 3 — Report

| # | Item | Command | Output | Verdict |
|---|------|---------|--------|---------|
| 1 | … | `ls -la backend/src/x.ts` | `-rw-r--r-- … x.ts` | PASS |
| 2 | … | `grep -n "foo" backend/src/x.ts` | *(no match)* | FAIL |

Close with the counts: `N PASS · M FAIL · K UNVERIFIED`.

Any FAIL or UNVERIFIED means the deliverable is not complete. Say that in those
words. Never describe a partial result as done — that is the failure Rule 36
exists to prevent, and it is recorded as the root cause of recurring missed
deliverables.

## Step 4 — Tick the boxes, only on a person's word

Rule 38 step 5: a task in `.claude/impl-pending.md` is marked complete only when
it has filesystem evidence. Step 2 produced that evidence. This step records it —
but not on your own authority.

After presenting the report, ask plainly:

> Items 1, 2 and 5 passed with the output above. Confirm and I will tick those
> boxes in `.claude/impl-pending.md`.

Then wait.

| What comes back | What you do |
|---|---|
| An explicit confirmation naming the items, or all of them | Tick exactly those boxes. Nothing else in the file changes |
| A refusal, or a correction | Tick nothing. Say what you left unticked |
| Silence, a change of subject, or anything ambiguous | Tick nothing. Ask once more, or leave it |

**Fail-closed**: absence of a confirmation is not a confirmation. Ticking a box
nobody agreed to converts an unverified claim into a permanent record that the
next reader will trust.

Never tick an item that came back `FAIL` or `UNVERIFIED`, even if asked to —
report that the evidence does not support it and stop. The tick means the
evidence exists, not that someone wants it to.

`.claude/impl-pending.md` is the only file this command may edit, and ticking a
checkbox is the only edit it may make.

## Step 5 — Close the round

When every item passes and the work is finished, the plan and its approval are
cleaned up so the next round starts from a closed gate:

```bash
rm .claude/impl-pending.md .claude/impl-approved
```

Ask before running it. Leaving both files in place is what leaves
`rule-38-check-approval.sh` permanently open — it only blocks when
`impl-pending.md` exists **without** `impl-approved`.

Report the state of both files at the end of every run, whatever the verdict, so
an open gate is visible rather than assumed. Report the tick count too — how many
boxes you ticked and how many you left, and why.
