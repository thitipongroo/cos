# 4. One handler, many events

**Creates**: `.claude/hooks/scripts/` · `.claude/hooks/config/` · the `hooks` block in `.claude/settings.json`
**Extracted from** — paths below are in the source repository, not in this kit: `.claude/settings.json` (30 events, counted) · `.claude/hooks/config/hooks-config.json` (31 keys, counted) · `.claude/hooks/scripts/hooks.py` docstring — "Supports all 30 Claude Code hooks" · `.claude/agents/weather-agent.md` (per-agent `hooks:` with `--agent=`)

---

Wire every hook event to the same script. Entries differ only by
`statusMessage`; the script branches on `hook_event_name`.

```json
"PreToolUse": [
  { "hooks": [{
      "type": "command",
      "command": "python3 ${CLAUDE_PROJECT_DIR}/.claude/hooks/scripts/hooks.py",
      "timeout": 5000,
      "async": true,
      "statusMessage": "PreToolUse"
  }]}
]
```

Standard shape: `type: command`, `timeout: 5000`, `async: true`. Exceptions
carried from the source: `Setup` uses `timeout: 30000`, and `PreCompact` /
`SessionStart` / `SessionEnd` add `once: true`. `FileChanged` is the one event
with a `matcher`.

Always reference the script through `${CLAUDE_PROJECT_DIR}`. A hardcoded path
works on exactly one machine.

## Switches live apart from wiring

Enabling and disabling never touches `settings.json`:

| To do this                   | Change this                                              |
| ---------------------------- | -------------------------------------------------------- |
| Silence one event            | `disable<Event>Hook: true` in `hooks-config.json`        |
| Silence it for yourself only | the same key in `hooks-config.local.json`                |
| Stop every hook              | `disableAllHooks: true` in `.claude/settings.local.json` |

Prefer a switch over deleting wiring — a deleted event is one nobody remembers to
restore.

## Per-agent hooks

An agent declares its own `hooks:` in frontmatter, calling the same script with
`--agent=<name>`, so one handler can still tell agent activity apart from the
main session.

## Rules for the handler

- Always exit 0 — a hook must never take the session down
- Standard library only — it runs on every tool call
- stdout belongs to the hook protocol; diagnostics go to stderr
- Truncate what you log — a single `tool_input` can be megabytes

_Prevents:_ thirty scripts that drift apart, and wiring nobody dares to edit.
