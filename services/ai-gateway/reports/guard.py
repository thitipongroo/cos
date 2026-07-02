import re
from dataclasses import dataclass, field

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
      2. Source attribution: confidence > 0 confirms LLM cited context
      3. Confidence score present and in [0.0, 1.0]
      4. Low confidence: confidence < 0.7 → fail (caller returns fallback)
      5. Contradiction: numbers in summary not found in context → flag POTENTIAL_HALLUCINATION
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

        # Check 2: source attribution — confidence == 0 means no source attribution at all.
        # Must run before the low-confidence threshold below, otherwise `< CONFIDENCE_THRESHOLD`
        # swallows the zero case and this check becomes dead code.
        if float(confidence) == 0.0:
            return GuardResult(passed=False, reason="zero confidence indicates no source attribution")

        # Check 4: low confidence threshold
        if float(confidence) < CONFIDENCE_THRESHOLD:
            return GuardResult(passed=False, reason="LOW_CONFIDENCE")

        # Check 5: contradiction — numbers in summary absent from context
        hallucination_flagged = self._check_contradiction(summary, context)

        return GuardResult(passed=True, hallucination_flagged=hallucination_flagged)

    def _check_contradiction(self, summary: str, context: str) -> bool:
        summary_numbers = set(re.findall(r'\b\d+(?:\.\d+)?\b', summary))
        context_numbers = set(re.findall(r'\b\d+(?:\.\d+)?\b', context))
        invented = summary_numbers - context_numbers
        return bool(invented)
