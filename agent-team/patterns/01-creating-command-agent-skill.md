# 1. Command → Agent → Skill

**Creates**: `.claude/commands/` · `.claude/agents/` · `.claude/skills/`
**Extracted from** — paths below are in the source repository, not in this kit: `CLAUDE.md` §Weather System ·
`orchestration-workflow/orchestration-workflow.md` §Architecture Patterns · `.claude/commands/weather-orchestrator.md` ·
`.claude/agents/weather-agent.md`

---

Three layers, one job each.

```text
/command          orchestrates: asks for input, calls things in order, reports
   └─ agent       decides: works inside a tool allowlist that makes wrong moves impossible
        └─ skill  executes: one procedure, no orchestration
```

## Skills attach two ways

The source calls these "two distinct skill patterns", and the difference decides
when the content enters context.

|               | How                                                                             | When                                                |
| ------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Preloaded** | `skills:` in the agent's frontmatter — the whole file enters context at startup | Knowledge the agent needs before its first decision |
| **Invoked**   | the `Skill` tool, at the moment it is needed                                    | A step that runs once, partway through              |

```yaml
# .claude/agents/<name>.md — preloaded
skills:
  - <skill-name>
```

```text
# from a command or agent body — invoked
Skill(skill: "<skill-name>")
```

A preloaded skill sets `user-invocable: false` so it stays out of the `/` menu.
It is still reachable by the Skill tool — hiding it from the menu does not hide
it from the model.

## Building one

1. Write the skill first. It is the only layer that touches the outside world
2. Write the agent, and give it only the tools the skill needs
3. Write the command last — it asks the user, calls the agent, calls the skill,
   and reports

_Prevents:_ one file that asks, decides, executes and reports — untestable, and
impossible to constrain.
