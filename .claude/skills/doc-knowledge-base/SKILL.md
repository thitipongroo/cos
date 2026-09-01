---
name: doc-knowledge-base
description: Build and maintain a searchable body of answers - troubleshooting, how-tos, decisions and their reasons. Use when the same questions keep being answered in chat and the answers are lost.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
---

# Knowledge Base

A knowledge base is judged by whether the answer is found, not by whether it
exists. Findability is the whole job.

## Writing an article

- **Title as the question that was asked**, in the asker's words. People search
  with symptoms, not with correct terminology
- **Answer in the first paragraph.** Context afterwards, for those who need it
- **One question per article.** Two questions in one article is found for neither
- **Include the error text verbatim** - that string is what people paste into
  search

## Structure that holds up

- Symptom, cause, fix, and how to confirm it is fixed
- Link to the reference documentation rather than restating it. Restated content
  is content that will disagree with the source within two releases
- Record the decision *and its reason* for anything that will be questioned again.
  The reason is what stops the same debate reopening

## Maintaining it

- **Date every article and mark what it was verified against.** Undated
  troubleshooting is a trap
- **Delete what is obsolete.** An article describing a version nobody runs sends
  readers down a dead path with confidence
- **Watch what people search for and do not find.** That list is the writing
  backlog, and it is more reliable than asking the team what is missing

## Rules

- Never let the knowledge base become the only home for something that belongs in
  the product documentation - fix it at the source and link

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins — read it before applying anything here.

- `context.md` QM-11 — Documentation Standards
- QM-17 — Incident Management

Runbooks are the knowledge base here, and QM-11 requires each to be executed end to end in staging within 30 days before its Stage transition. QM-17 fixes the postmortem template and the five-business-day deadline.
