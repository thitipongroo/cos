# Agent Team

Claude Code configuration installed in this repository — what runs, what was
deliberately left out, and where each piece lives.

Adapted from the `00-agent-team` kit. This page describes **this repository**, not
the kit; where the two differ, the difference is recorded below.

---

## What runs

|                         |         | Where                                                                                                               |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `/plan-gate`            | command | Rule 38 gate — extracts the spec line by line into `.claude/impl-pending.md`, then stops for product owner approval |
| `/verify`               | command | Rule 36 gate — one filesystem check per obligation, reporting `PASS` / `FAIL` / `UNVERIFIED` with real output       |
| `/workspace`            | command | Wraps `workspace-isolation` — where a multi-step change gets built, decided before the first edit                   |
| `/finish`               | command | Wraps `branch-completion` — green suite, the product owner's choice, then cleanup                                   |
| `/drift`                | command | Sends a read-only researcher at the docs, re-confirms every finding, reports the gaps, changes nothing              |
| `/engineering`          | command | Dispatches `engineering-agent`, whose fail-closed contract stops when no skill covers the request                   |
| `/qa`                   | command | Dispatches `qa-agent` with the QM-6 budgets, QM-14 SLOs and Phase 19 named, so nothing is measured against a guess  |
| `/devops`               | command | Dispatches `devops-agent` with QM-16, QM-12, QM-4, QM-18, ADR-012 and Rule 28 named                                 |
| `/docs`                 | command | Dispatches `doc-agent` with QM-11, Rule 29, Rule 37 and the specification-first authority order named               |
| `engineering-agent`     | agent   | Routes to the 12 engineering skills                                                                                 |
| `qa-agent`              | agent   | Routes to the 12 QA skills                                                                                          |
| `doc-agent`             | agent   | Routes to the 6 documentation skills                                                                                |
| `devops-agent`          | agent   | Routes to the 6 DevOps skills                                                                                       |
| `doc-drift-researcher`  | agent   | Read-only. Powers `/drift`                                                                                          |
| 36 domain skills        | skills  | `engineering-*` 12 · `qa-*` 12 · `doc-*` 6 · `devops-*` 6                                                           |
| `spec-reading`          | skill   | The discipline both gates depend on. Not in the `/` menu                                                            |
| `phase-index`           | skill   | The map from a Phase number to the one file in `context/phases/` to read                                            |
| `markdown-docs`         | rule    | Loads only when a `.md` file is touched (`paths:` frontmatter)                                                      |
| `rationalization-guard` | rule    | No `paths:` — loads every session. The sentences that precede a skipped Rule 36 or Rule 38                          |

Full inventory with what each one is for: **[CATALOG.md](CATALOG.md)**.

## What was deliberately left out

| Not installed                                                      | Why                                                                                                                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `settings.json` from the kit                                       | This repository wires `PreToolUse` / `PostToolUse` / `Stop` to `rule-26` … `rule-38` shell scripts. The kit wires 30 events to a Python handler this repository does not have. Overwriting would disable every Rule 26–38 gate |
| The kit's `hooks/`                                                 | Different architecture — several scripts per event here, one handler there                                                                                                                                                     |
| The kit's `CLAUDE.md`                                              | This repository has its own, holding the Rule 36 and Rule 38 gates                                                                                                                                                             |
| `marketing-*` `social-media-*` `sales-*` `motion-*` skills (37)    | No matching surface here — none of the 25 backend modules and no file under `docs/specifications/` covers those domains                                                                                                        |
| `operations-*` `product-*` `management-*` `research-*` skills (27) | Product owner decision: engineering disciplines only for this round                                                                                                                                                            |
| The `superpowers` plugin                                           | Four of its skills were adapted by hand instead — see [Borrowed from Superpowers](#borrowed-from-superpowers). Installed whole, its session-start bootstrap and its subagent execution model both collide with rules here      |

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

## How an agent gets reached

Nothing forces an agent to be used. There are three ways in, and only two of them
are reliable:

| Way in                                         | Who decides | Reliable                                              |
| ---------------------------------------------- | ----------- | ----------------------------------------------------- |
| A command naming `subagent_type`               | the command | Yes — `/engineering` `/qa` `/devops` `/docs` `/drift` |
| A person invoking the agent by name            | the person  | Yes                                                   |
| Auto-delegation from the agent's `description` | the model   | No — nothing enforces it                              |

The same holds one level down, for skills. Every skill here is reachable three
ways — through the agent that routes it, by a person naming it, or by
auto-discovery — and only the first two are reliable. That is why the four
cross-domain skills each have a command (`/plan-gate` and `/verify` reach
`spec-reading`; `/workspace` and `/finish` reach the other two), and why
`CLAUDE.md` names a command rather than a skill in every row of its table:
naming the skill invites the work to happen without the agent, and the agent is
what carries the fail-closed contract.

No hook can close this gap: hooks fire on tool calls, and the choice to dispatch
happens before any tool call. That is why each routing agent has a command, why
every `description` here says `PROACTIVELY`, and why `CLAUDE.md` names the command
in its "When to invoke what" table. Three overlapping paths, none of them
sufficient alone.

Dispatching moves work, not gates. Rule 38's approval must exist before a
subagent writes source, and the spec reading behind it is never delegated. Rule 36
applies to what you report after the agent returns — its report is a claim, and a
claim is what Rule 36 exists to test.

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

## Borrowed from Superpowers

Four pieces here are adapted from [obra/superpowers](https://github.com/obra/superpowers) (MIT), which is a plugin for
the same problem this folder solves. The plugin itself is **not installed** — its session-start hook injects a bootstrap
that requires a skill be invoked before any response, which collides with this repository's own first instruction to
read `context.md`, and its subagent-driven execution model collides with Rule 38's ban on delegating the spec reading.

| Here                           | Adapted from                               | Why this one                                                                 |
| ------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------- |
| `engineering-receiving-review` | `receiving-code-review`                    | Nothing here covered the receiving side of a review                          |
| `workspace-isolation`          | `using-git-worktrees`                      | Rewritten for a pnpm + turbo monorepo, where a worktree costs a full install |
| `branch-completion`            | `finishing-a-development-branch`           | Wired to `verify-before-push.sh` and Rule 36                                 |
| `rationalization-guard`        | the Red Flags table in `using-superpowers` | The rows are rewritten against Rules 36 and 38                               |

Pattern [11](patterns/11-testing-a-skill.md) records the method those files were tested with.

## Design reference

- **[PATTERNS.md](PATTERNS.md)** — the ten structural patterns behind this layout
- **[FRONTMATTER.md](FRONTMATTER.md)** — every frontmatter field, per artifact type
