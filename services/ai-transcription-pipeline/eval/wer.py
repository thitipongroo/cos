"""Word Error Rate (WER) evaluation for voice transcription.

Spec 30-testing-strategy §375: transcription must reach WER < 10% on 50 Thai construction-site
recordings. WER = (substitutions + deletions + insertions) / reference_word_count, via a
token-level Levenshtein distance.

Thai has no inter-word spaces, so a "word" error rate needs a word tokenizer. The tokenizer is
INJECTABLE (default: whitespace). The Thai word-segmentation library is NOT specified by the spec;
`pythainlp.word_tokenize` is the common choice and should be injected for the Thai corpus run (see
run_commonvoice.py). Which Thai tokenizer to standardize on is a pending decision, deliberately not
baked in here.
"""
from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass, field


def whitespace_tokenize(text: str) -> list[str]:
    return text.split()


def _levenshtein(ref: list[str], hyp: list[str]) -> int:
    n, m = len(ref), len(hyp)
    if n == 0:
        return m
    if m == 0:
        return n
    prev = list(range(m + 1))
    for i in range(1, n + 1):
        cur = [i] + [0] * m
        for j in range(1, m + 1):
            cost = 0 if ref[i - 1] == hyp[j - 1] else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
        prev = cur
    return prev[m]


def word_error_rate(reference_tokens: list[str], hypothesis_tokens: list[str]) -> float:
    if not reference_tokens:
        return 0.0 if not hypothesis_tokens else 1.0
    return _levenshtein(reference_tokens, hypothesis_tokens) / len(reference_tokens)


@dataclass
class CorpusResult:
    mean_wer: float
    count: int
    per_sample: list[float] = field(default_factory=list)


def evaluate_corpus(
    pairs: Iterable[tuple[str, str]],
    tokenize: Callable[[str], list[str]] = whitespace_tokenize,
) -> CorpusResult:
    """pairs: (reference_text, hypothesis_text). Returns the mean WER across all pairs."""
    per_sample = [word_error_rate(tokenize(ref), tokenize(hyp)) for ref, hyp in pairs]
    mean = sum(per_sample) / len(per_sample) if per_sample else 0.0
    return CorpusResult(mean_wer=mean, count=len(per_sample), per_sample=per_sample)
