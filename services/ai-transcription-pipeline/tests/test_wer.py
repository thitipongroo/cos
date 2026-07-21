import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from eval.wer import _levenshtein, evaluate_corpus, whitespace_tokenize, word_error_rate


class TestLevenshteinEmptyEdges:
    """The two early-return guards in _levenshtein.

    `word_error_rate` short-circuits an empty reference before it ever calls `_levenshtein`, so the
    `n == 0` guard is unreachable through the public API and is exercised directly here — it is a
    pure function, and leaving the branch untested would mean the distance matrix has an untested
    boundary. The `m == 0` guard IS reachable publicly, so it is asserted both ways.
    """

    def test_empty_reference_costs_one_insertion_per_hypothesis_token(self):
        assert _levenshtein([], ["a", "b", "c"]) == 3

    def test_both_empty_is_zero_distance(self):
        assert _levenshtein([], []) == 0

    def test_empty_hypothesis_costs_one_deletion_per_reference_token(self):
        assert _levenshtein(["a", "b"], []) == 2

    def test_empty_hypothesis_via_public_api_is_total_loss(self):
        # Every reference word deleted → WER 1.0 (2 deletions / 2 reference words).
        assert word_error_rate(["a", "b"], []) == 1.0


class TestWordErrorRate:
    def test_identical_is_zero(self):
        assert word_error_rate(["a", "b", "c"], ["a", "b", "c"]) == 0.0

    def test_single_substitution(self):
        assert word_error_rate(["a", "b", "c"], ["a", "x", "c"]) == 1 / 3

    def test_single_deletion(self):
        assert word_error_rate(["a", "b", "c"], ["a", "c"]) == 1 / 3

    def test_single_insertion(self):
        assert word_error_rate(["a", "b"], ["a", "b", "c"]) == 0.5

    def test_both_empty_is_zero(self):
        assert word_error_rate([], []) == 0.0

    def test_empty_reference_nonempty_hypothesis_is_one(self):
        assert word_error_rate([], ["a"]) == 1.0

    def test_thai_tokens_via_injected_segmentation(self):
        # Simulates a Thai word-segmenter output (no whitespace in source text).
        ref = ["สวัสดี", "ครับ", "วันนี้"]
        hyp = ["สวัสดี", "ครับ", "พรุ่งนี้"]  # one substitution
        assert word_error_rate(ref, hyp) == 1 / 3


class TestEvaluateCorpus:
    def test_mean_over_pairs(self):
        res = evaluate_corpus(
            [("a b c", "a b c"), ("a b c", "a x c")], tokenize=whitespace_tokenize
        )
        assert res.count == 2
        assert abs(res.mean_wer - (0.0 + 1 / 3) / 2) < 1e-9

    def test_meets_spec30_threshold_when_accurate(self):
        # spec 30 §375: WER < 0.10
        res = evaluate_corpus([("the quick brown fox", "the quick brown fox")])
        assert res.mean_wer < 0.10
