# 9. Packaging a workflow in its own folder

**Creates**: a subfolder holding its own `.claude/` plus the doc that explains it
**Extracted from** — paths below are in the source repository, not in this kit: `development-workflows/rpi/` (`rpi-workflow.md`, `.claude/agents/` ×8, `.claude/commands/rpi/` ×3) · `agent-teams/.claude/` · registration behaviour observed live in one session

---

A workflow can ship as a folder that carries everything it needs — its own
`agents/`, `commands/` and `skills/` under a nested `.claude/`, beside the
document that explains it.

```
project/
├── .claude/                    the project's own configuration
└── some-workflow/
    ├── .claude/
    │   ├── agents/
    │   ├── commands/
    │   └── skills/
    └── some-workflow.md        install, outputs, agent map
```

## What a nested `.claude/` actually does — and what is unknown

Do not assume a nested `.claude/` is inert. Observed in a single session:

| Observation | Result |
|---|---|
| Two nested `.claude/` present at session start (`agent-teams/`, `development-workflows/rpi/`) | none of their agents or skills appeared in the session's listings |
| A skill created mid-session under a third nested `.claude/`, then worked on | **appeared** as an available skill — and it existed nowhere else on the machine |
| The agent and three commands in that same nested `.claude/` | no corresponding announcement |

So skills under a nested `.claude/` **can** become available. Whether that is
because discovery runs lazily when you work in the directory, or re-runs when
files change, was not determined — do not write either explanation into a
document as fact.

What is safe to rely on:

- The `.claude/` at a **working directory root** is registered. Count on it
- Nesting deeper **inside** a registered `.claude/` does not hide anything —
  `.claude/commands/workflows/best-practice/workflow-claude-skills.md` registers
  as `workflows:best-practice:workflow-claude-skills`. A subfolder namespaces a
  command; it does not exempt it
- A nested `.claude/` is **not** a reliable way to keep something from loading.
  If a file must never register, keep it out of any `.claude/` directory

## The document that ships with it

A packaged workflow is unusable without three things written down. The source's
RPI workflow states all three in one 100-line file.

### 1. How to install it

Name what is copied, where it goes, and anything that must be created
afterwards — a copy alone is often not enough:

> Copy the `.claude` folder (containing `agents/` and `commands/rpi/`) to your
> repository root, then create the `rpi/plans` directory.

That trailing clause is the part that gets forgotten. A directory the commands
write into but the copy does not create makes the first run fail on a path error,
which reads as a broken workflow rather than a missing step.

### 2. Where its output goes

Declare the output tree up front, so a reader knows what the workflow will
produce before running it:

```
rpi/{feature-slug}/
├── REQUEST.md              # Step 1: initial description
├── research/RESEARCH.md    # Step 2: GO/NO-GO analysis
├── plan/
│   ├── PLAN.md             # Step 3: roadmap
│   ├── pm.md · ux.md · eng.md
└── implement/IMPLEMENT.md  # Step 4: implementation record
```

Undeclared output is how a workflow ends up writing into a directory someone
else owns.

### 3. Which command uses which agent

| Command | Agents used |
|---------|-------------|
| `/rpi:research` | requirement-parser, product-manager, Explore, senior-software-engineer, technical-cto-advisor, documentation-analyst-writer |
| `/rpi:plan` | senior-software-engineer, product-manager, ux-designer, documentation-analyst-writer |
| `/rpi:implement` | Explore, senior-software-engineer, code-reviewer |

This table is what tells a reader which of the eight agent files are actually
reachable, and it drifts the moment a command changes without it.

It has drifted in the source: `/rpi:implement` lists three agents here, but the
command file itself also routes to `constitutional-validator`
(`.claude/commands/rpi/implement.md:48`, under Support Agents). The agent is real
and is used — the summary table simply fell behind. Re-derive this table from the
command files rather than editing it by hand.

## The trade

Everything the workflow needs lives beside it, and the project's own `/` menu
stays readable. The cost is a copy step and three things to document — and the
knowledge that a nested `.claude/` may still surface some of its contents.

*Prevents:* a workflow that cannot be installed because only its author knew what
to copy, where its output lands, and which agents it really calls.
