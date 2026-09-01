# 10. Changelog + verification checklist

**Creates**: `changelog/<topic>/changelog.md` · `changelog/<topic>/verification-checklist.md`
**Extracted from** — paths below are in the source repository, not in this kit: 9 `changelog.md` files (800 recorded runs, counted) sharing one status legend · 3 `verification-checklist.md` files (9, 18 and 32 rules)

---

A recurring check needs two files: one that records what happened, one that
records what must be checked. They grow from each other.

## `changelog.md` — what happened, every run

Opens with a status legend, identical across all 9 files in the source:

| Status | Meaning |
|--------|---------|
| ✅ `COMPLETE (reason)` | Action was taken and resolved successfully |
| ❌ `INVALID (reason)` | Finding was incorrect, not applicable, or intentional |
| ✋ `ON HOLD (reason)` | Action deferred — waiting on external dependency or user decision |

One section per run, `## [<date time>] <what was checked>`, then a table:

```markdown
| # | Priority | Type | Action | Status |
|---|----------|------|--------|--------|
| 1 | MED | Extra Bundled Skill | `keybindings-help` is in the report but absent upstream — remove or keep | ✅ COMPLETE (removed — it is a local custom skill, not a bundled one) |
```

Four rules hold this together:

- **Record every run, including the empty ones.** A quiet run is written as one
  line with the numbers that prove the check happened:
  *"No drift detected — frontmatter fields (10) and bundled skills (5) are fully
  synchronized with official docs."* Of 800 recorded runs in the source, most are
  exactly this
- **Every status carries its reason in parentheses.** A bare ✅ records that
  someone typed a tick, not what they decided
- **❌ `INVALID` is a real outcome.** The finding was wrong, or the difference was
  deliberate. Without it, every finding becomes work
- **Append; never rewrite history.** New runs go at the end

## `verification-checklist.md` — what must be checked, every run

Its own header states the contract. The source words it this way, naming its own
workflow — the shape generalises:

> Rules accumulate over time. Each workflow-changelog run MUST execute ALL rules
> at the specified depth. When a new type of drift is caught that an existing
> rule should have caught (but didn't exist or was too shallow), append a new
> rule here.

Every rule carries the same fields — as prose or as a table row:

`Category` · `Check` · `Depth` · `Compare Against` · `Added` · `Origin`

## `Origin` is the field that matters

It records the real incident that caused the rule to exist:

> v2.1.78 caught `showTurnDuration` and `terminalProgressBarEnabled` listed in
> Display Settings as settings.json keys, but official docs explicitly state they
> belong in `~/.claude.json` and "Adding them to settings.json will trigger a
> schema validation error." No rule existed to verify file scope

That single field is what makes the checklist grow from failures rather than from
imagination. If a proposed rule has nothing to write in `Origin`, it is a guess
about what might go wrong — leave it out until it does.

The two files feed each other: a run writes to the changelog, and a run that
missed something writes a rule into the checklist.

*Prevents:* a recurring check that gets shallower every time it is run, and a
history that only records the interesting runs.
