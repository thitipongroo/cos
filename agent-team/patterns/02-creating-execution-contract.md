# 2. Execution contract

**Creates**: a section inside every `.claude/commands/*.md` and `.claude/agents/*.md`
**Extracted from** — paths below are in the source repository, not in this kit: `.claude/commands/weather-orchestrator.md` · `.claude/agents/weather-agent.md` — the only two files in the source carrying `## Execution Contract (non-negotiable)` and `**Fail-closed guardrail**`

---

Near the top of every command and agent, state three things:

## 1. The one allowed path

```markdown
You MUST complete this by delegating to the `<agent-name>` subagent.
```

Name the tool. "Use the weather agent" is ambiguous; "use the Agent tool with
subagent_type: weather-agent" is not.

## 2. What is forbidden

```markdown
You are forbidden from:

- fetching the data yourself via Bash, WebFetch, or any other tool
- skipping Step 1
- calling the skill before the agent returns
```

List the shortcuts that look reasonable, and the excuses that accompany them —
"I already know the value", "it is cached", "this is faster".

## 3. A fail-closed guardrail

```markdown
**Fail-closed guardrail**: If the agent does not return a numeric value and unit,
DO NOT proceed to Step 3. Report the failure and stop.
```

Every handoff between layers gets one. Without it, a layer that returns garbage
becomes a layer that improvises.

## Back it with the allowlist

Instructions are the weaker half. Remove the tool that enables the shortcut, then
say so in the file. The source words it this way, verbatim:

> Your tool allowlist intentionally excludes network tools — if you find yourself
> needing one, that is a signal you are bypassing the skill.

Use `tools:` for a subagent — that is the field the documentation defines
(`best-practice/claude-subagents.md`, measured against v2.1.251).

All eleven registered agents in the source use `allowedTools:` instead. Ten of
them list eleven tools including `Bash`, `WebFetch` and `WebSearch`, so nothing
about them is observable either way. The eleventh is the one that shows it:
`weather-agent` declares exactly two — `Read` and `Skill` — with network tools
left out on purpose and a paragraph in the file explaining why. It was listed as
holding every tool. No restriction, and no error to notice.

_Prevents:_ a capable agent taking a faster path than the one that was designed.
