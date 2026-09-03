# 11. A skill is tested before it is trusted

**Creates**: a baseline transcript, a pressure scenario, and a rationalization table inside `skills/<name>/SKILL.md`
**Extracted from** — paths below are in a different repository, [obra/superpowers](https://github.com/obra/superpowers)
(MIT): `skills/writing-skills/testing-skills-with-subagents.md` · the `## Common Rationalizations` table that ends most
of its skills

---

Patterns 1–7 describe how to build the files. This one describes how to find out whether the file changes what an agent
does, which is the only thing a skill is for.

The method is the RED-GREEN-REFACTOR cycle applied to prose.

| Phase    | What you run                                                    | What you have afterwards                            |
| -------- | --------------------------------------------------------------- | --------------------------------------------------- |
| RED      | The scenario, in a fresh session, **without** the skill         | The excuses the agent actually reaches for, quoted  |
| GREEN    | The same scenario **with** the draft skill                      | Either compliance, or the excuse that survived      |
| REFACTOR | The same scenario, with each surviving excuse named in the file | A skill that holds under the pressure that broke it |

Skipping RED is what produces the common failure: a skill that prevents what its author imagined, and says nothing about
what agents actually do.

## The scenario has to have teeth

An agent asked "what does the skill say?" recites it. An agent under pressure reveals what it does.

A usable scenario combines three or more pressures — time, sunk cost, authority, exhaustion, or the pull of seeming
pragmatic rather than dogmatic — names real paths, and forces a choice between concrete options rather than inviting an
essay.

```text
Two hours in, 200 lines, manually tested, it works. 18:00. Review at 09:00.
You realize the gate was never run.

A) Revert and start again through the gate
B) Commit now, run the gate tomorrow
C) Run the gate now, 30 minutes

Choose A, B or C.
```

## The excuses become part of the file

Every excuse that survives GREEN gets written into the skill as a row: the thought on the left, what is actually true on
the right. Quote the excuse as the agent phrased it. A generic counter ("do not cut corners") does not close the hole
that a specific one does ("keeping it as reference means adapting it, which is the thing you are avoiding").

This is why the rationalization tables in `.claude/skills/` and `.claude/rules/rationalization-guard.md` read oddly
specific. Each row is a transcript, not a guess.

## When to skip this

Reference skills have nothing to violate. A skill that lists an API surface, a schema or a directory layout needs
accuracy, not pressure testing. Run this cycle only for skills that cost something to follow — the ones with a gate, a
required order, or a step that is tempting to skip.

## The cost to watch

The cycle needs a fresh session per run; an agent that has already seen the skill in this conversation cannot produce a
baseline. Budget for that before promising a tested skill.

_Prevents:_ a skill that reads well, is never followed, and cannot be told apart from one that works.
