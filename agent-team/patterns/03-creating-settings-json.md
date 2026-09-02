# 3. Configuration hierarchy

**Creates**: `.claude/settings.json` · `.claude/settings.local.json` · `.claude/.gitignore`
**Extracted from** — paths below are in the source repository, not in this kit: `CLAUDE.md` §Configuration Hierarchy · `.claude/.gitignore`

---

Highest wins:

1. Managed policy (`managed-settings.json` / MDM plist / Registry) — cannot be overridden
2. Command-line arguments — this session only
3. `.claude/settings.local.json` — personal, git-ignored
4. `.claude/settings.json` — shared with the team
5. `~/.claude/settings.json` — personal defaults across all projects
6. `hooks-config.local.json` over `hooks-config.json`

## The rule that follows

**Shared and personal are always separate files, and the personal one is
git-ignored.** Never one file that everyone edits and no one can commit.

The source ships exactly three ignore entries:

```gitignore
settings.local.json
hooks/config/hooks-config.local.json
hooks/logs/
```

Every layer of the hierarchy that is personal appears in that list. If you add a
personal layer, add its ignore line in the same commit — a personal file that
reaches git turns into everyone's file.

## Permissions

`allow` widens deliberately; `ask` is a floor rather than a list to trim. Each
`ask` entry is a command that hurts to undo — `rm`, `chmod`, `docker`, `kubectl`,
`kill`. `deny` stays empty until something genuinely must never run.

_Prevents:_ a settings file that cannot be shared because it contains one
person's paths.
