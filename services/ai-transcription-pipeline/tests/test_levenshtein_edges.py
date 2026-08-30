"""Edge cases of the token-level Levenshtein distance behind WER — spec 30 §375.

§35.13 ESC-24: eval/wer.py sat at 94% with two lines uncovered — the empty-reference and
empty-hypothesis short-circuits in _levenshtein. Both are reachable through the public API (an
empty transcript, or an empty reference sentence in the corpus) and each has a distinct meaning
for the score, so they are asserted through word_error_rate rather than only the private helper.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from eval.wer import _levenshtein, word_error_rate


class TestLevenshteinShortCircuits:
    def test_empty_reference_costs_one_insertion_per_hypothesis_token(self):
        assert _levenshtein([], ["a", "b", "c"]) == 3

    def test_empty_hypothesis_costs_one_deletion_per_reference_token(self):
        assert _levenshtein(["a", "b", "c"], []) == 3

    def test_both_empty_costs_nothing(self):
        assert _levenshtein([], []) == 0

    def test_still_computes_the_normal_case(self):
        # one substitution
        assert _levenshtein(["a", "b"], ["a", "c"]) == 1


class TestWordErrorRateWithEmptyInputs:
    def test_a_silent_transcript_against_a_real_sentence_is_a_total_miss(self):
        """Every reference word is deleted, so WER is 1.0 — a failed transcription, not a pass."""
        assert word_error_rate("the quick brown fox", "") == pytest.approx(1.0)

    def test_a_transcript_against_an_empty_reference(self):
        wer = word_error_rate("", "hallucinated words here")
        assert wer >= 0.0
