# Rationalization Guard

This rule carries no `paths:` frontmatter, so it loads in every session. That is deliberate and it is the only reason it
is short: the thoughts below arrive *before* a file is touched, which is earlier than any path glob can fire.

Rules 36 and 38 are not skipped by decision. They are skipped by a sentence that makes skipping them sound reasonable.
These are the sentences. Meeting one in your own reasoning is the signal to stop and run the gate.

## Before the work

| The thought | What is actually true |
| --- | --- |
| "This is a question, not a task" | Answering it will read files and may change them. It is a task. |
| "I need context before I can plan" | `/plan-gate` reads the spec first. The plan is how you get context, not what you produce after having it. |
| "Let me explore the codebase first" | Rule 38 step 1 is the reading. Exploring instead of reading the spec is how obligations get missed. |
| "This is one small change, the gate is overkill" | The gate costs a minute. A missed obligation costs a phase. |
| "The spec is long — I will have a subagent extract the items" | Rule 38 forbids it, because a subagent summarizes and the dropped item is always the one phrased unlike its neighbours. |
| "The product owner clearly wants this" | Clearly is not explicitly. Rule 38 is a human gate; inference does not satisfy it. |
| "I remember what this rule says" | Rules change. Read the current file. |

## Before saying it is done

| The thought | What is actually true |
| --- | --- |
| "I just wrote it, of course it exists" | Rule 36 wants the `ls` output, not the memory of writing. |
| "The tests passed earlier" | They passed on that tree. Run them on this one. |
| "I verified the important ones" | "I checked X" and "the list is complete" are different claims. Only the second closes the task. |
| "It should pass CI" | Run `bash scripts/ci/verify-before-push.sh` and paste what it printed. A prediction is not a check. |
| "That failure is unrelated to my change" | Say so to the product owner with the output, and let them decide. |
| "This item is obviously satisfied" | Then the command proving it costs nothing. Run it. |

## What to do on a hit

Stop the current action. Name the thought. Run the gate it was steering you around — `/plan-gate` for the first table,
`/verify` for the second. Then continue.

The hooks catch part of this: `rule-38-check-approval.sh` refuses `.ts`, `.tsx` and `.sql` writes while a plan is
pending and unapproved. Everything else on these two tables has no signature a script can match, which is why it is
written here in prose.

Adapted from the Red Flags table in the `using-superpowers` skill of obra/superpowers (MIT); the rows are rewritten
against this repository's Rules 36 and 38.
