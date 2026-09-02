# 6. Progressive disclosure inside a skill

**Creates**: `.claude/skills/<name>/`
**Extracted from** — paths below are in the source repository, not in this kit: `.claude/skills/weather-svg-creator/` (SKILL.md + reference.md + examples.md) · its `## Additional resources` section

---

```
skills/<name>/
├── SKILL.md      steps and rules — short, always read
├── reference.md  templates, schemas, specs — read when needed
└── examples.md   input/output pairs
```

`SKILL.md` ends by linking the rest:

```markdown
## Additional resources

- For the SVG template, output template, and design specs, see [reference.md](reference.md)
- For example input/output pairs, see [examples.md](examples.md)
```

## What goes where

| File           | Holds                                                      | Read                      |
| -------------- | ---------------------------------------------------------- | ------------------------- |
| `SKILL.md`     | numbered steps, hard rules, output paths                   | every invocation          |
| `reference.md` | anything long — templates, schemas, tables of placeholders | at the step that needs it |
| `examples.md`  | worked pairs, including the case that must fail closed     | when checking output      |

If a step in `SKILL.md` needs thirty lines of template, the step becomes "use the
template from `reference.md`" and the template moves.

## Frontmatter that decides reach

| Field                   | Effect                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `description`           | how the model decides to invoke it — write it as _when_, not _what_                     |
| `user-invocable: false` | hidden from the `/` menu; still reachable by the Skill tool and by `skills:` preloading |
| `allowed-tools`         | what runs without a permission prompt while the skill is active                         |

_Prevents:_ a skill so long that the steps are lost inside the reference material.
