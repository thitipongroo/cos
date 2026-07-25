# ADR-073: Voice-command intents for the SITE_ENGINEER home FAB

**Date:** 2026-07-25
**Status:** Accepted
**Deciders:** Product Owner, AI/Mobile
**Tags:** mobile, ai, voice

---

## Context

The SITE_ENGINEER home mockup shows a voice FAB. It was omitted (ADR-071 scope note) because a tap-FAB
"AI voice command" had **no defined target action** — `<VoiceNoteButton />` is hold-to-record against a
field, not a command router. The Product Owner decided (2026-07-25, after field-service research) that
the FAB is a **voice command → NLP intent** launcher routed through the AI gateway.

Research (field-service apps — Provalet, FieldEZ) shows the hands-free pattern is voice → transcribe →
NLP intent → action: dictate-to-create (report/issue), plus search and navigation.

## Decision

The FAB flow is: **tap → record → transcribe (existing pipeline) → classify intent (AI gateway) →
confirm → route**. The intent set (PO decision 2026-07-25) is four intents; routing is grounded in the
mobile screens that actually exist:

| Intent         | Action                                              | Target (exists?)                        |
| -------------- | --------------------------------------------------- | --------------------------------------- |
| `DAILY_REPORT` | open the daily-report capture, transcript prefilled | `/report` ✓                             |
| `LOG_ISSUE`    | open the issue create, transcript prefilled         | `/issues` (has quick-create) ✓          |
| `NAVIGATE`     | go to a named screen                                | home/issues/inspections/reports/tasks ✓ |
| `SEARCH`       | **unsupported for now** — no search screen exists   | — (deferred)                            |

`SEARCH` is recognised by the classifier but returns an **unsupported** action (a "not available yet"
message), never a route to a non-existent screen. Wiring it needs a search screen — a separate feature.

Intent classification is a new AI-gateway endpoint (LLM, via the same `LLMProvider`). Like every other
gateway LLM path it is **stub-safe**: with no provisioned key it returns 503 and the FAB degrades to
"voice command unavailable" rather than guessing an intent.

## Consequences

### Positive

- The FAB has a defined, screen-grounded behaviour; the routing logic is pure and unit-tested to 100%.

### Negative / open

- `SEARCH` is inert until a search screen exists. Live classification needs the gateway's LLM key wired
  (deferred, like the F4b feed) — until then the FAB shows "unavailable".
- Transcript **prefill** on `/report` and `/issues` depends on those screens reading an initial param.

### Neutral

- The classifier is instructed to return `UNKNOWN` when unsure; `UNKNOWN` → unsupported, so a
  misheard command never fires a wrong action.

## References

- ADR-071 (SiteEngineerHome §32.7 exception — the FAB's scope note); `<VoiceNoteButton />` (§32.7:855)
- `services/ai-gateway` (LLMProvider, stub-safe posture); PO decision 2026-07-25; field-service research
