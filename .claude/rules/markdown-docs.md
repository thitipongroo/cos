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
