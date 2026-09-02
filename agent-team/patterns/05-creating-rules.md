# 5. Rules that load only when relevant

**Creates**: `.claude/rules/*.md`
**Extracted from** — paths below are in the source repository, not in this kit: `CLAUDE.md` — the only line in the
source containing "lazy-loaded" · `.claude/rules/markdown-docs.md` (`**/*.md`) · `.claude/rules/presentation.md`
(`presentation/**`)

---

A rule with `paths:` frontmatter loads when a matching file is touched. Without
frontmatter it loads into every session, like CLAUDE.md.

```yaml
---
paths:
  - 'migrations/**'
---
```

Put the trap where the work is: the migration rule appears when someone opens a
migration, not in every session about anything.

## Two shapes worth copying

**A constraint rule** states what must hold for that file class, in sentences
that can be judged true or false.

**A delegation rule** routes work away from the file entirely. The source's
`presentation.md` is one: a table mapping path → owner, the sentence _"Never edit
presentation HTML directly"_, the literal `Agent(...)` call, what to do when the
path is ambiguous, and a `## Why` section.

That `## Why` is the part that earns its place. It lets a reader decide the cases
the table does not cover.

## The cost to watch

A rule that restates a fact held somewhere else creates two copies that can
disagree. Cite the source, or move the fact rather than copying it.

_Prevents:_ a context file that grows until the important lines are buried.
