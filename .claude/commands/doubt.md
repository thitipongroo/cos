---
description: Run the Rule 41 doubt gate — one adversarial fresh-context review of a non-trivial decision, before it stands
argument-hint: [the decision, diff or claim you are about to commit to]
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Task
---

# /doubt

Run one Rule 41 cycle over `$ARGUMENTS`. This command reads and reviews. It writes no files and
edits no code.

## Step 0 — Is it in scope

Check `$ARGUMENTS` against the non-trivial list in `.claude/rules/rule-41-doubt-driven.md`. If none
of the four conditions holds, say which one you checked, say it is out of scope, and stop. Running
this on a rename is how the rule gets ignored when it matters.

## Step 1 — CLAIM

Write, in the transcript:

```text
CLAIM:            <two or three lines — what is being asserted>
WHY IT MATTERS:   <what goes wrong if it is false>
```

If it cannot be written that compactly, it is a feeling and not a decision. Sharpen it first.

## Step 2 — EXTRACT

Assemble two blocks and nothing else.

**ARTEFACT** — the diff, the function, or the proposal in three to five sentences. Not the file, not
the branch. Small enough to hold in one read; if it is a 500-line change, split it and run this
command per part.

**CONTRACT** — what it has to satisfy, stated so a stranger could check it. Pull the real constraint
from the source, do not paraphrase from memory:

| The decision touches   | The contract comes from                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| a migration            | QM-9, and the rollback in `backend/prisma/rollbacks/`                       |
| a Kafka event          | the `.avsc`, and the typed contract in `packages/@cos/shared`               |
| a guard or middleware  | QM-4, and the RLS requirement in `docs/specifications/07-multi-tenant-*`    |
| money                  | the `decimal.js` rule in `context.md` §GLOBAL EXECUTION RULES               |
| an endpoint            | QM-2, QM-10, and the OpenAPI document in `docs/api/`                        |
| a Phase deliverable    | the Generate / Constraints section of that Phase file in `context/phases/`  |

Strip your reasoning out of both blocks.

## Step 3 — DOUBT

Spawn one general-purpose subagent with the Task tool. Paste this prompt verbatim, then the two
blocks. Do **not** use `engineering-agent` or any other persona here: their response shape is a
balanced verdict, and a balanced verdict is what this step exists to avoid.

```text
Adversarial review. Find what is wrong with this artefact.
Assume the author is overconfident. Look for:
- unstated assumptions
- edge cases not handled
- hidden coupling or shared state
- ways the contract could be violated
- conventions in this repository it breaks
- failure modes under unexpected input, retry, or concurrent execution

Do NOT validate. Do NOT summarize. Report issues, or state explicitly that you
cannot find any after thorough examination.

ARTEFACT:
<paste>

CONTRACT:
<paste>
```

**Do not pass the CLAIM.** The reviewer decides for itself whether the artefact satisfies the
contract; telling it your conclusion buys agreement.

## Step 4 — RECONCILE

Re-read the artefact text against each finding before you classify it. The reviewer's output is
data, not a verdict — rubber-stamping it is the same failure as ignoring it. First matching class
wins:

| Class              | Meaning                                                        | What you do                                         |
| ------------------ | -------------------------------------------------------------- | --------------------------------------------------- |
| 1 Contract misread | flagged because the CONTRACT you supplied was thin             | fix the contract, re-run — do not touch the artefact |
| 2 Actionable       | a real defect under the contract                               | change the artefact, re-run                         |
| 3 Trade-off        | real, but costs more to fix than to accept                     | state it in the transcript so the product owner sees it |
| 4 Noise            | correct under context the reviewer did not have                | note it, and ask whether the contract should have said so |

## Step 5 — STOP

Stop when findings are trivial or already considered, at **three cycles**, or when the product owner
says ship. Three cycles that still surface substantive issues is information about the artefact —
escalate, do not run a fourth alone. If three feels obviously too few, the artefact is too big:
return to Step 2 and split it.

## Report

```text
DOUBT — <subject>              cycle <n>/3
CLAIM        <one line>
FINDINGS     <n> total · <n> actionable · <n> trade-off · <n> noise · <n> contract misread
CHANGED      <what moved in the artefact, or "nothing">
TRADE-OFFS   <each one, or "none">
STOP REASON  trivial findings | 3 cycles | product owner
```

If two or more cycles produced substantive findings and **none** were classified actionable, print
`DOUBT THEATER — escalating` instead of a stop reason, and hand it to the product owner.

## After this command

`/doubt` is not a gate that lets work through. Rule 38 still needs product owner approval before the
first line of code, and Rule 36 still needs command output per obligation before anything is called
done.
