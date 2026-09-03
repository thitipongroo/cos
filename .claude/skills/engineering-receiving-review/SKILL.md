---
name: engineering-receiving-review
description: Respond to review feedback — understand it, check it against this codebase, implement what holds and push back on what does not. Use when a review, a bug report or a comment thread has arrived and before acting on any of it.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Bash"
---

# Receiving Review

Feedback is a claim about the code. Evaluate it before acting on it, the same way you would evaluate any other claim.

## The order

1. **Read** the whole thing before responding to any of it
2. **Restate** each item as a technical requirement, in your own words
3. **Verify** each restatement against the code — read the file, run the test, grep for the caller
4. **Decide** per item: correct, incorrect, or unclear
5. **Respond** — the fix, the reasoning, or the question
6. **Implement** one item at a time, proving each before starting the next

Step 3 is the one that gets skipped. A reviewer who has not read the surrounding code can be confidently wrong, and a
suggestion implemented without checking costs more than the defect it was aimed at.

## Unclear items block the whole batch

If any item is unclear, ask about it before implementing any item — including the ones you understood.

Items in one review are usually related. Implementing four of six and asking about the other two produces work that has
to be redone once the answer arrives, because the answer changes what the four should have been.

Say which items you understood and which you did not. Do not guess at an item to avoid asking.

## Push back when the code says otherwise

Push back when the suggestion breaks behaviour that is covered by a test, when the reviewer is missing context that
exists in the file, when the suggestion adds a feature nothing calls, when it contradicts a decision already recorded in
the specification or an ADR, or when it is wrong for this stack.

Push back with the evidence, not with an opinion:

- the file and line that contradicts it
- the test that covers the current behaviour
- the grep that shows nothing calls the endpoint
- the ADR or specification section that settled it

If you cannot verify the claim either way, say exactly that and say what would settle it. "I cannot check this without a
staging database — should I request one, or proceed on the assumption that X?" is a complete answer. Proceeding quietly
on an unverified claim is not.

## Say what you did, not how you feel about it

Report a fix as a fix: what changed, where, and what proves it.

Agreement phrases — "you're absolutely right", "great catch", "thanks for spotting that" — carry no information, and
they get written most readily in exactly the case where the verification was skipped. The changed lines are the
acknowledgement.

The same applies in reverse. If you pushed back and were wrong, state the correction and the fix in one sentence. An
apology adds nothing that the correction did not already say.

## Common failures

| Failure | What it looks like | Instead |
| --- | --- | --- |
| Performative agreement | "Great point, fixing now" before reading the file | State the requirement, then verify it |
| Blind implementation | The suggestion becomes a commit without a check | Verify against the code first |
| Batch without proof | Six fixes, one test run at the end | One item, one proof, then the next |
| Partial understanding | Four items done, two questions asked afterwards | Ask first, then implement all six |
| Silent inability to verify | Proceeding on a claim you could not check | Say what you could not check and what would settle it |
| Scope creep by review | A "while you're in there" suggestion becomes unplanned work | New scope goes back through the plan gate |

## In this repository

Feedback arriving mid-task does not create new scope on its own. Any item that adds a deliverable beyond the approved
list goes back through `/plan-gate` — Rule 38 is a human gate and a reviewer's comment does not substitute for the
product owner's approval. Items that fix an approved deliverable are inside the existing approval and can proceed.

Before reporting the items fixed, `/verify` applies as it does to any completion claim: one command per item, with its
output. Rule 36 does not soften because the item came from someone else.

Where a suggestion meets a Quality Mandate, the mandate wins and is the answer to give — QM-1 for coverage, QM-2 for API
versioning, QM-3 for translated copy, QM-9 for backward compatibility, QM-10 for the error envelope. Cite the mandate
rather than arguing the point from first principles.

When the review is a diff review you are performing rather than receiving, use `engineering-code-reviewer`.

Method adapted from the `receiving-code-review` skill in obra/superpowers (MIT). The repository-specific paragraphs
above are this project's.
