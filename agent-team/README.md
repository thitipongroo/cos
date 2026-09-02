# Agent Team

Claude Code configuration installed in this repository — what runs, what was
deliberately left out, and where each piece lives.

Adapted from the `00-agent-team` kit. This page describes **this repository**, not
the kit; where the two differ, the difference is recorded below.

---

## What runs

|                        |         | Where                                                                                                               |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `/plan-gate`           | command | Rule 38 gate — extracts the spec line by line into `.claude/impl-pending.md`, then stops for product owner approval |
| `/verify`              | command | Rule 36 gate — one filesystem check per obligation, reporting `PASS` / `FAIL` / `UNVERIFIED` with real output       |
| `/drift`               | command | Sends a read-only researcher at the docs, re-confirms every finding, reports the gaps, changes nothing              |
| `engineering-agent`    | agent   | Routes to the 11 engineering skills                                                                                 |
| `qa-agent`             | agent   | Routes to the 12 QA skills                                                                                          |
| `doc-agent`            | agent   | Routes to the 6 documentation skills                                                                                |
| `devops-agent`         | agent   | Routes to the 6 DevOps skills                                                                                       |
| `doc-drift-researcher` | agent   | Read-only. Powers `/drift`                                                                                          |
| 35 domain skills       | skills  | `engineering-*` 11 · `qa-*` 12 · `doc-*` 6 · `devops-*` 6                                                           |
| `spec-reading`         | skill   | The discipline both gates depend on. Not in the `/` menu                                                            |
| `markdown-docs`        | rule    | Loads only when a `.md` file is touched (`paths:` frontmatter)                                                      |

Full inventory with what each one is for: **[CATALOG.md](CATALOG.md)**.

## What was deliberately left out

| Not installed                                                      | Why                                                                                                                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `settings.json` from the kit                                       | This repository wires `PreToolUse` / `PostToolUse` / `Stop` to `rule-26` … `rule-38` shell scripts. The kit wires 30 events to a Python handler this repository does not have. Overwriting would disable every Rule 26–38 gate |
| The kit's `hooks/`                                                 | Different architecture — several scripts per event here, one handler there                                                                                                                                                     |
| The kit's `CLAUDE.md`                                              | This repository has its own, holding the Rule 36 and Rule 38 gates                                                                                                                                                             |
| `marketing-*` `social-media-*` `sales-*` `motion-*` skills (37)    | No matching surface here — none of the 25 backend modules and no file under `docs/specifications/` covers those domains                                                                                                        |
| `operations-*` `product-*` `management-*` `research-*` skills (27) | Product owner decision: engineering disciplines only for this round                                                                                                                                                            |

## What was changed for this repository

`/plan-gate` and `/verify` ship in the kit writing and reading
`.claude/plan-pending.md`. Here they use **`.claude/impl-pending.md`** — the file
`.claude/hooks/rule-38-check-approval.sh` actually watches — and follow the plan
format this repository already uses.

Left unchanged, they would have produced a second, unenforced gate beside the
real one.

`/plan-gate` also builds a `TodoWrite` list when the tool is available, per Rule 38
step 2, and writes every checkbox unticked. `/verify` ticks them — but only after a
person confirms the reported evidence, and never for an item that came back `FAIL`
or `UNVERIFIED`. Silence is not confirmation.

## The two gates

`/plan-gate` closes the front: the obligation list comes from the spec, read line
by line, and the product owner approves it before code exists. `/verify` closes
the back: completion is a claim about the filesystem, so a command proves each
item.

Neither can close itself. `/plan-gate` must not create `.claude/impl-approved` —
that file is the human gate, and an agent creating it defeats the only check in
the workflow.

## Adding to this

- **A new skill** — `.claude/skills/<group>-<name>/SKILL.md`, then add a row to
  that group's agent routing table. A skill missing from the table is one the
  agent will never reach
- **A project rule** — `.claude/rules/<name>.md` with a `paths:` glob, so it
  loads when the matching files are touched instead of in every session
- **A new group** — copy it from the kit, then update [CATALOG.md](CATALOG.md)

The skills carry method only — no tool names, no thresholds. Anything specific to
this repository (coverage gates, deploy windows, the Quality Mandates) belongs in
`.claude/rules/` or in `CLAUDE.md`, not inside a skill.

## Design reference

- **[PATTERNS.md](PATTERNS.md)** — the ten structural patterns behind this layout
- **[FRONTMATTER.md](FRONTMATTER.md)** — every frontmatter field, per artifact type
