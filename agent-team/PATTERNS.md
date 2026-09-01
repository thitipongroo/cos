# Patterns

Ten structures worth reusing in any project. Each one is here because it prevents
a specific failure, and each lives in one file next to the folder it came from.

Every pattern file opens with two lines: **Creates** — what you end up writing —
and **Extracted from** — the files it was read out of, so a claim here can be
checked against them.

Those paths point into the repository the patterns were extracted from, not into
this kit. Both have a `.claude/` and a `CLAUDE.md`, so a bare path like
`.claude/settings.json` would otherwise resolve to the wrong file.

---

## Building `.claude/`

| # | Pattern | Creates | Prevents |
|---|---------|---------|----------|
| 1 | [Command → Agent → Skill](patterns/01-creating-command-agent-skill.md) | `commands/` `agents/` `skills/` | one file that asks, decides, executes and reports |
| 2 | [Execution contract](patterns/02-creating-execution-contract.md) | a section in every command and agent | a capable agent taking a faster path than the one designed |
| 3 | [Configuration hierarchy](patterns/03-creating-settings-json.md) | `settings.json` · `settings.local.json` · `.gitignore` | a settings file that cannot be shared |
| 4 | [One handler, many events](patterns/04-creating-hooks.md) | `hooks/` and the `hooks` block | thirty scripts that drift apart |
| 5 | [Rules that load when relevant](patterns/05-creating-rules.md) | `rules/*.md` with `paths:` | a context file that buries its own important lines |
| 6 | [Progressive disclosure](patterns/06-creating-skills.md) | `skills/<name>/` | a skill whose steps are lost inside its reference material |
| 7 | [Read-then-report](patterns/07-creating-research-workflow.md) | a coordinator command + a read-only agent | an agent editing files on its own unverified conclusion |

## Keeping a check honest

| # | Pattern | Creates | Prevents |
|---|---------|---------|----------|
| 8 | [Verification has a declared depth](changelog/08-verification-depth.md) | the `Depth` column in a checklist | a check that passes because it was run shallowly |
| 10 | [Changelog + verification checklist](changelog/10-changelog-and-checklist.md) | `changelog/<topic>/` — two files | a check that gets shallower every run, and a history that records only the interesting ones |

## Packaging a workflow

| # | Pattern | Creates | Prevents |
|---|---------|---------|----------|
| 9 | [Packaging a workflow in its own folder](workflows/09-scoped-configuration.md) | a subfolder with its own `.claude/` + the doc that explains it | a workflow only its author can install |

---

## Where the files sit

Pattern files live beside the folder they were extracted from, except where that
would make them run. A file inside `.claude/commands/` or `.claude/agents/` is a
real command or agent — a subfolder only adds a namespace, it does not exempt the
file, and a nested `.claude/` is not a reliable way to keep one quiet either
(pattern 9). So patterns 1–7, which are about building `.claude/`, sit in
`patterns/` rather than inside it.

```
agent-team/
├── PATTERNS.md          this index
├── patterns/            1–7  · about building .claude/
├── changelog/           8, 10 · about keeping a recurring check honest
├── workflows/           9    · about packaging a workflow as a folder
├── README.md            what was installed here, and what was not
├── CATALOG.md           every agent and skill installed, by domain
└── FRONTMATTER.md       every frontmatter field, per artifact type

.claude/                 what actually runs — see CATALOG.md for the inventory
```

The skills are flat: `.claude/skills/<group>-<name>/SKILL.md`. Grouping is carried
in the name rather than in a folder, because a folder nests the skill one level
deeper than the layouts observed to register — see pattern 9.

---

## Writing rules these follow

From `CLAUDE.md` and `.claude/rules/markdown-docs.md` in the source:

- **CLAUDE.md under 200 lines.** Past that, adherence drops. Move detail into
  `rules/` behind a `paths:` glob
- **One topic per file**
- **Relative links** between documents, never absolute host URLs to the same repo
- **Headings descend one level at a time**
- **A count in a heading is a claim** — recount it when the list changes
- **Commit one file at a time** when the changes are unrelated; a mixed commit
  cannot be reverted cleanly
