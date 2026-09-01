---
paths:
  - "**/*.md"
---

# Markdown Docs

## Structure

- One topic per file. A file that needs two titles is two files
- Headings descend one level at a time — never `##` straight to `####`
- Link between documents with relative paths (`../guide/setup.md`), never an
  absolute host URL to the same repository; absolute links break on forks,
  mirrors, and local checkouts

## Claims

- Every path, command, and filename written in a document must exist. Check it
  with `ls` before writing the line, not after someone reports it broken
- A count in a heading ("Fields (12)") is a claim — it must match the rows below
  it, and it must be recounted whenever the list changes
- Version numbers and dates are copied from the source, never recalled

## Editing

- Preserve the surrounding voice, heading depth, and table style. A document
  should not reveal where one author stopped and another started
- When a section is replaced, delete what it replaced. A stale paragraph left
  below a new one is worse than no documentation, because it reads as current

## In this repository

- Documentation lives under `docs/` — `api` `architecture` `assessments` `evidence`
  `manual` `policies` `registers` `research` `runbooks` `screens` `specifications`.
  Documentation about the agent configuration lives in `agent-team/`
- `docs/specifications/` is the source of truth for architecture.
  `context/00_master_construction_os.md` is the compiled execution view of it, and
  `context.md` the agent-facing form. When they disagree, the specification wins
- **Rule 37** — after modifying anything under `docs/specifications/`, grep
  `context.md` and `context/00_master_construction_os.md` for the changed section
  number, technology name or concept, and update them in the same commit.
  `rule-37-check-spec-drift.sh` injects the grep result on write; acting on it is
  still yours
- **Rule 29** — before writing `(see ADR-NNN)`, confirm `docs/architecture/adr/NNN-*.md`
  exists. `rule-29-check-adrs.sh` blocks the write if it does not
- **QM-11** — every module carries a README with purpose, public API, dependencies,
  configuration and a usage example; every architectural decision becomes an ADR in
  `docs/architecture/adr/`
- Commit one file per commit, per `CLAUDE.md`
