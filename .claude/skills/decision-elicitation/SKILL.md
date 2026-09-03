---
name: decision-elicitation
description: Turn an AWAITING_DECISION or UNSPECIFIED item into an answered one — ask the product owner one question at a time with your own guess attached, then restate the decision for an explicit yes. Use when Rule 38 has blocked on an escalation and the work cannot proceed until someone decides.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "AskUserQuestion"
---

# Decision Elicitation

The AWAITING_DECISION protocol is good at **stopping**. It has nothing to say about how the decision
then gets made, so in practice the block is broken by a long message listing everything at once, and
the answer comes back thin or not at all.

This skill is the other half: how to get a blocked item answered in the fewest rounds, without
putting words in the product owner's mouth.

## When to use

- Rule 38 produced one or more `NEEDS_ESCALATION` items and work cannot continue
- A `## REQUIRED DECISIONS` section in `context/05_*` … `context/11_*` is unanswered
- The spec is ambiguous in a way `docs/specifications/32-implementation-specifications.md` does not
  settle, and `context.md` §On ambiguity says to ask

**Not for:** anything already resolved. Before asking, confirm the item genuinely qualifies — the
definitions are in `CLAUDE.md` §NEEDS_ESCALATION criteria, and infrastructure credentials, resolved
technology choices, and anything marked RESOLVED are **not** escalations. A question about something
already answered in the specs costs more trust than the answer is worth.

## Step 1 — Read before asking

Never ask what the repository can tell you. For each blocked item, grep first:

```bash
grep -rn "<the concept>" docs/specifications/ context/ docs/architecture/adr/
```

Report what you found in two lines. Most items shrink or disappear here. This step is also what
prevents the failure recorded in `CLAUDE.md`: an escalation raised because the resolution was on the
same page and nobody read it.

## Step 2 — Hypothesis with a confidence number

Before the first question, write your current best reading of what is wanted, in one sentence, with
an honest number:

```text
HYPOTHESIS:  <one sentence>
CONFIDENCE:  ~40% — missing: <what is still unresolved>
```

Below about 70%, the reason is mandatory. It tells the product owner exactly what to close, and it
stops the number being decoration.

## Step 3 — One question at a time, each with your guess attached

```text
Q:      <one focused question>
GUESS:  <your hypothesis for the answer, and the reasoning that produced it>
```

Then wait. Three questions in one message is a form, not a conversation: it gets skimmed, and the
third question usually depends on the answer to the first anyway.

The guess is not a shortcut. Reacting to a wrong guess is faster than composing an answer from
nothing, and committing to a guess is what makes your assumption visible enough to be corrected. The
risk is a polite yes — mitigate it by guessing, sometimes, in the direction you expect to be pushed
back on.

Use `AskUserQuestion` where the decision is a choice between concrete options; use plain prose where
it is open.

## Step 4 — Listen for the convention answer

The dangerous answers are the ones that sound like a thoughtful answer rather than being one:
"scalable", "clean", "the standard approach", "I should probably". When you hear one, the question
that does the work is:

> If you did not have to justify this to anyone, what would you actually want?

## Step 5 — Restate, and get an explicit yes

```text
DECISION      <one line — what was chosen>
BECAUSE       <one line — the reason, in the product owner's words>
APPLIES TO    <which spec section, Phase, or module this binds>
OUT OF SCOPE  <what this decision explicitly does not cover>
RECORD IN     <docs/architecture/adr/NNN-*.md | context/NN_*.md REQUIRED DECISIONS | a QM>
```

"Whatever you think", "sounds good", and silence are **not** a yes. Re-ask with two concrete options
framed as a choice.

The `OUT OF SCOPE` line is not optional: half of the misalignment on a decision is silent
disagreement about what it does not cover.

## Step 6 — Write it where it binds

An answer that lives only in a chat transcript is not a resolved decision — the next session starts
blocked again on the same item. Route it:

| The decision                                  | Goes to                                                    |
| --------------------------------------------- | ---------------------------------------------------------- |
| architectural, or expensive to reverse        | a new ADR in `docs/architecture/adr/` (Rule 29 applies)     |
| answers a `## REQUIRED DECISIONS` entry       | that entry in `context/05_*` … `context/11_*`               |
| sets a number, a threshold or a procedure     | a Quality Mandate in `.claude/rules/`, indexed in `context.md` |
| resolves a spec ambiguity                     | the spec file itself, plus the Rule 37 grep in the same commit |

Then return to `/plan-gate` and re-tag the item `READY`.

## This project decides it

The blocking behaviour is not this skill's to change: `context.md` §AWAITING_DECISION PROTOCOL and
`CLAUDE.md` §NEEDS_ESCALATION criteria stay authoritative, and the product owner approval in Rule 38
step (c) is a human gate that no amount of good questioning replaces. This skill only shortens the
distance between the block and the answer.
