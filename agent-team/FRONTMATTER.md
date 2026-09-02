# Frontmatter Reference

Every frontmatter field for subagents, skills, commands and rules, in one place.

Extracted from the reports in `../best-practice/` (measured against Claude Code
**v2.1.251**). Field lists change between releases — re-check them against the
official docs before relying on a field that behaves unexpectedly. `/drift` will
flag the paths in this file if they move; it cannot know when upstream adds a field.

---

## Subagents — `.claude/agents/<name>.md` (16 fields)

| Field             | Type        | Required | Description                                                                                                                                                                                                              |
| ----------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`            | string      | Yes      | Unique identifier using lowercase letters and hyphens                                                                                                                                                                    |
| `description`     | string      | Yes      | When to invoke. Use `"PROACTIVELY"` for auto-invocation by Claude                                                                                                                                                        |
| `tools`           | string/list | No       | Comma-separated allowlist of tools (e.g., `Read, Write, Edit, Bash`). Inherits all tools if omitted. Supports `Agent(agent_type)` syntax to restrict spawnable subagents; the older `Task(agent_type)` alias still works |
| `disallowedTools` | string/list | No       | Tools to deny, removed from inherited or specified list                                                                                                                                                                  |
| `model`           | string      | No       | Model to use: `sonnet`, `opus`, `haiku`, a full model ID (e.g., `claude-opus-4-6`), or `inherit` (default: `inherit`)                                                                                                    |
| `permissionMode`  | string      | No       | Permission mode: `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, or `plan`                                                                                                                             |
| `maxTurns`        | integer     | No       | Maximum number of agentic turns before the subagent stops                                                                                                                                                                |
| `skills`          | list        | No       | Skill names to preload into agent context at startup (full content injected, not just made available)                                                                                                                    |
| `mcpServers`      | list        | No       | MCP servers for this subagent — server name strings or inline `{name: config}` objects                                                                                                                                   |
| `hooks`           | object      | No       | Lifecycle hooks scoped to this subagent. All hook events are supported; `PreToolUse`, `PostToolUse`, and `Stop` are the most common                                                                                      |
| `memory`          | string      | No       | Persistent memory scope: `user`, `project`, or `local`                                                                                                                                                                   |
| `background`      | boolean     | No       | Set to `true` to always run as a background task (default: `false`)                                                                                                                                                      |
| `effort`          | string      | No       | Effort level override when this subagent is active: `low`, `medium`, `high`, `xhigh`, `max` (Opus 4.6 only). Default: inherits from session                                                                              |
| `isolation`       | string      | No       | Set to `"worktree"` to run in a temporary git worktree (auto-cleaned if no changes)                                                                                                                                      |
| `initialPrompt`   | string      | No       | Auto-submitted as the first user turn when this agent runs as the main session agent (via `--agent` or the `agent` setting). Commands and skills are processed. Prepended to any user-provided prompt                    |
| `color`           | string      | No       | Display color for the subagent in the task list and transcript: `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, or `cyan`                                                                                  |

---

## Skills — `.claude/skills/<name>/SKILL.md` (20 fields)

| Field                      | Type        | Required    | Description                                                                                                                                                                                                                                                           |
| -------------------------- | ----------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                     | string      | No          | Display name and `/slash-command` identifier. Defaults to the directory name if omitted                                                                                                                                                                               |
| `description`              | string      | Recommended | What the skill does. Shown in autocomplete and used by Claude for auto-discovery                                                                                                                                                                                      |
| `when_to_use`              | string      | No          | Additional context for when Claude should invoke the skill — trigger phrases and example requests. Appended to `description` in the skill listing, counts toward the 1,536-character cap                                                                              |
| `argument-hint`            | string      | No          | Hint shown during autocomplete (e.g., `[issue-number]`, `[filename]`)                                                                                                                                                                                                 |
| `arguments`                | string/list | No          | Named positional arguments for `$name` substitution in the skill content. Accepts a space-separated string or a YAML list — names map to argument positions in order                                                                                                  |
| `disable-model-invocation` | boolean     | No          | Set `true` to prevent Claude from automatically invoking this skill                                                                                                                                                                                                   |
| `user-invocable`           | boolean     | No          | Set `false` to hide from the `/` menu — skill becomes background knowledge only, intended for agent preloading                                                                                                                                                        |
| `allowed-tools`            | string      | No          | Tools allowed without permission prompts when this skill is active                                                                                                                                                                                                    |
| `disallowed-tools`         | string/list | No          | Tools removed from Claude's available pool while the skill is active (e.g. block `AskUserQuestion` for a background loop). Accepts a space/comma-separated string or YAML list — the restriction clears on the next message                                           |
| `model`                    | string      | No          | Model to use when this skill runs (e.g., `haiku`, `sonnet`, `opus`)                                                                                                                                                                                                   |
| `effort`                   | string      | No          | Override the model effort level when invoked (`low`, `medium`, `high`, `xhigh`, `max`)                                                                                                                                                                                |
| `context`                  | string      | No          | Set to `fork` to run the skill in an isolated subagent context                                                                                                                                                                                                        |
| `agent`                    | string      | No          | Subagent type when `context: fork` is set (default: `general-purpose`)                                                                                                                                                                                                |
| `background`               | boolean     | No          | Only applies with `context: fork`. Set to `false` to wait for the forked subagent's result in the invoking turn instead of running in the background (default: `true`). Requires v2.1.218+                                                                            |
| `hooks`                    | object      | No          | Lifecycle hooks scoped to this skill                                                                                                                                                                                                                                  |
| `paths`                    | string/list | No          | Glob patterns that limit when the skill auto-activates. Accepts a comma-separated string or YAML list — Claude loads the skill only when working with matching files                                                                                                  |
| `shell`                    | string      | No          | Shell for `` !`command` `` blocks — `bash` (default) or `powershell`. Requires `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`                                                                                                                                                    |
| `metadata`                 | YAML map    | No          | Free-form YAML map for your own key-value data (e.g., entitlement or catalog fields) read by your own tooling from `SKILL.md`. Claude Code does not act on its contents; drops values that aren't a map. Do not reuse frontmatter field names (e.g., `paths`) as keys |
| `license`                  | string      | No          | License covering the skill. Part of the [Agent Skills](https://agentskills.io) spec. Claude Code accepts the field but does not act on it                                                                                                                             |
| `compatibility`            | string      | No          | Environment requirements for the skill (max 500 chars), such as intended products or system prerequisites. Part of the [Agent Skills](https://agentskills.io) spec. Claude Code accepts the field but does not act on it                                              |

---

## Commands — `.claude/commands/<name>.md` (20 fields)

Commands and skills accept the same 20 fields — the difference is where the
file lives and how it is reached, not what it may declare.

| Field                      | Type        | Required    | Description                                                                                                                                                                                                                         |
| -------------------------- | ----------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                     | string      | No          | Display name and `/slash-command` identifier. Defaults to the directory name if omitted                                                                                                                                             |
| `description`              | string      | Recommended | What the command does. Shown in autocomplete and used by Claude for auto-discovery                                                                                                                                                  |
| `when_to_use`              | string      | No          | Additional context for when Claude should invoke the skill — trigger phrases or example requests. Appended to `description` in the listing and counts toward the 1,536-character cap                                                |
| `argument-hint`            | string      | No          | Hint shown during autocomplete (e.g., `[issue-number]`, `[filename]`)                                                                                                                                                               |
| `arguments`                | string/list | No          | Named positional arguments for `$name` substitution in command content. Accepts a space-separated string or YAML list — names map to argument positions in order                                                                    |
| `disable-model-invocation` | boolean     | No          | Set `true` to prevent Claude from automatically invoking this command                                                                                                                                                               |
| `user-invocable`           | boolean     | No          | Set `false` to hide from the `/` menu — command becomes background knowledge only                                                                                                                                                   |
| `paths`                    | string/list | No          | Glob patterns that limit when this skill is activated. Accepts a comma-separated string or a YAML list. When set, Claude loads the skill automatically only when working with files matching the patterns                           |
| `allowed-tools`            | string      | No          | Tools allowed without permission prompts when this command is active                                                                                                                                                                |
| `disallowed-tools`         | string/list | No          | Tools removed from Claude's available pool while this command is active. Clears when you send your next message. The inverse of `allowed-tools`                                                                                     |
| `model`                    | string      | No          | Model to use when this command runs (e.g., `haiku`, `sonnet`, `opus`)                                                                                                                                                               |
| `effort`                   | string      | No          | Override the model effort level when invoked (`low`, `medium`, `high`, `xhigh`, `max`)                                                                                                                                              |
| `context`                  | string      | No          | Set to `fork` to run the command in an isolated subagent context                                                                                                                                                                    |
| `agent`                    | string      | No          | Subagent type when `context: fork` is set (default: `general-purpose`)                                                                                                                                                              |
| `background`               | boolean     | No          | Only applies with `context: fork`. Set to `false` to wait for the forked subagent's result in the turn that invoked the skill, instead of running it in the background. Default: `true`. Requires v2.1.218+                         |
| `shell`                    | string      | No          | Shell for `` !`command` `` blocks — accepts `bash` (default) or `powershell`. Requires `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`                                                                                                          |
| `metadata`                 | object      | No          | Free-form YAML map for your own key-value data. Claude Code ignores the content (which must be a map); useful for catalog or entitlement fields read by your own tooling. Do not reuse reserved field names such as `paths` as keys |
| `license`                  | string      | No          | License covering the skill per the [Agent Skills](https://agentskills.io) spec. Claude Code accepts the field but does not act on it                                                                                                |
| `compatibility`            | string      | No          | Environment requirements for the skill per the [Agent Skills](https://agentskills.io) spec, such as intended products or system prerequisites. Accepts up to 500 characters. Claude Code accepts the field but does not act on it   |
| `hooks`                    | object      | No          | Lifecycle hooks scoped to this command                                                                                                                                                                                              |

---

## Rules — `.claude/rules/<name>.md`

| Field   | Type | Required | Description                                                                                                                               |
| ------- | ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `paths` | list | No       | Glob patterns. With it, the rule loads only when a matching file is touched. Without it, the rule loads into every session like CLAUDE.md |

---

## Choosing between them

| Reach for    | When                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| **Rule**     | A constraint that applies to a class of files, with no steps to run       |
| **Skill**    | A procedure — one job, invoked by the model or preloaded into an agent    |
| **Command**  | A workflow a person starts by name, that orchestrates other pieces        |
| **Subagent** | Work that needs its own tool allowlist, its own context, or its own model |

The field that separates the two skill patterns is `user-invocable`. Set it
`false` for a skill meant only to be preloaded into an agent through that agent's
`skills:` list — it stays out of the `/` menu.
