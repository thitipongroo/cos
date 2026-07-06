import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from eval.wer import evaluate_corpus, whitespace_tokenize, word_error_rate


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
