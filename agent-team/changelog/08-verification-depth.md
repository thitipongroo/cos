# 8. Verification has a depth, and it is declared

**Creates**: the `Depth` column in `changelog/<topic>/verification-checklist.md`
**Extracted from** — paths below are in the source repository, not in this kit: `changelog/best-practice/claude-settings/verification-checklist.md` · `changelog/best-practice/claude-subagents/verification-checklist.md` — both open with the same Depth Levels table

---

"Check it" is not an instruction. Two people given the same check will verify it
at different depths, and the shallower one will pass something the deeper one
catches. So the depth is named per rule, from a fixed vocabulary.

| Depth            | Meaning                                                |
| ---------------- | ------------------------------------------------------ |
| `exists`         | a section, table, or file is present                   |
| `presence-check` | one specific item is present or absent                 |
| `content-match`  | actual values compared word by word against the source |
| `field-level`    | every individual field is accounted for                |
| `cross-file`     | the same value matches across more than one file       |

Each rule also names its **Compare Against** — the artifact that settles the
question. A check with no source to compare against cannot be run twice with the
same result.

## Why this beats "verify it carefully"

The two directions are different checks, and only naming the depth forces both:

- `field-level` **forward** — every field in the source appears in the report
- `field-level` **inverse** — every field in the report exists in the source

The source repository learned the second one the hard way. One rule's Origin
records it: suspect keys _"stayed ON HOLD for 6 runs because no rule checked the
reverse direction — items in report that shouldn't be there."_

## Applying it

When you write a check, answer three questions in the rule itself:

1. At what depth — pick from the table, do not invent an adverb
2. Against what source — a file, a page, the filesystem
3. What output proves it — the command, and what its result must be

An item whose depth cannot be met in the current environment is unverified, and
unverified is not a pass.

_Prevents:_ a check that passes because it was run shallowly.
