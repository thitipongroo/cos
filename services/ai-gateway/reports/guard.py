import re
from dataclasses import dataclass

MIN_WORDS = 50
MAX_WORDS = 500
CONFIDENCE_THRESHOLD = 0.7


@dataclass
class GuardResult:
    passed: bool
    reason: str | None = None
    hallucination_flagged: bool = False


class HallucinationGuard:
    """Validates every AI output before returning to client.

    5 mandatory checks (spec §Phase 12 Hallucination Guard):
      1. Length: summary 50–500 words
      2. Source attribution: `sources` non-empty AND every snippet present in the context
      3. Confidence score present and in [0.0, 1.0]
      4. Low confidence: confidence < 0.7 → fail (caller returns fallback)
      5. Contradiction: numbers in summary not found in context → flag POTENTIAL_HALLUCINATION

    CHECK 2 WAS NOT A SOURCE-ATTRIBUTION CHECK (TDD OQ-41, rewritten 2026-08-23). It tested
    `confidence == 0.0 → fail`, which check 4 already subsumes — a model returning 0.9 for an
    entirely fabricated narrative passed both, and no output model had a citation field for it to
    check. It attributed nothing.

    It now requires the model to quote the context it drew on, and verifies those quotes are
    actually IN the context. That is what makes it un-fakeable: a plausible-looking citation the
    model invented does not appear in the context and fails.

    A CONSEQUENCE WORTH KNOWING. `main.py` passes `context_data=""` for SITE_SUMMARY,
    PROCUREMENT_SUMMARY and EXECUTIVE_SUMMARY — only delay-risk assembles real context, and only
    when the DB pool is wired. A report generated from no project data cannot cite any, so those
    three now fail check 2 and the caller returns `LowConfidenceResponse` instead of a summary.
    That is the check working: a narrative written from an empty context is fabrication by
    construction, and `raw_data_available: True` tells the client to show the underlying data
    instead. They start returning summaries again when their context assembly is built.
    """

    def validate(self, output: dict, context: str) -> GuardResult:
        summary = output.get("summary") or output.get("executive_summary", "")

        # Check 1: length
        word_count = len(summary.split())
        if word_count < MIN_WORDS:
            return GuardResult(passed=False, reason=f"summary too short: {word_count} words (min {MIN_WORDS})")
        if word_count > MAX_WORDS:
            return GuardResult(passed=False, reason=f"summary too long: {word_count} words (max {MAX_WORDS})")

        # Check 3: confidence score present and valid
        confidence = output.get("confidence")
        if confidence is None:
            return GuardResult(passed=False, reason="missing confidence field in LLM output")
        if not isinstance(confidence, (int, float)):
            return GuardResult(passed=False, reason="confidence must be a number")
        if not (0.0 <= float(confidence) <= 1.0):
            return GuardResult(passed=False, reason=f"confidence out of range: {confidence}")

        # Check 2: source attribution — the model must quote the context it used, and those quotes
        # must be findable in it. Runs before the confidence threshold so an ungrounded report is
        # reported as ungrounded rather than as "low confidence", which is a different problem with a
        # different fix.
        attribution = self._check_attribution(output, context)
        if attribution is not None:
            return GuardResult(passed=False, reason=attribution)

        # Check 4: low confidence threshold
        if float(confidence) < CONFIDENCE_THRESHOLD:
            return GuardResult(passed=False, reason="LOW_CONFIDENCE")

        # Check 5: contradiction — numbers in summary absent from context
        hallucination_flagged = self._check_contradiction(summary, context)

        return GuardResult(passed=True, hallucination_flagged=hallucination_flagged)

    def _check_attribution(self, output: dict, context: str) -> str | None:
        """Reason the output fails source attribution, or None if it passes.

        Whitespace is normalised on both sides before matching: a model that re-wraps a quoted line
        has still cited it, and failing that would push callers to quote single words to be safe —
        which would make the check pass while meaning nothing.

        Matching is on the SNIPPET being present in the context, not the other way round. A report
        may legitimately cite a fraction of a long context; what it may not do is cite something that
        is not there.
        """
        sources = output.get("sources")
        if not isinstance(sources, list) or not sources:
            return "no sources cited — the report is not attributable to any retrieved data"

        haystack = " ".join(context.split())
        if not haystack:
            return "sources cited but the retrieval context was empty — nothing to attribute to"

        for raw in sources:
            if not isinstance(raw, str) or not raw.strip():
                return "a cited source is empty"
            needle = " ".join(raw.split())
            if needle not in haystack:
                return f"cited source not found in the retrieval context: {needle[:80]!r}"
        return None

    def _check_contradiction(self, summary: str, context: str) -> bool:
        summary_numbers = set(re.findall(r'\b\d+(?:\.\d+)?\b', summary))
        context_numbers = set(re.findall(r'\b\d+(?:\.\d+)?\b', context))
        invented = summary_numbers - context_numbers
        return bool(invented)
