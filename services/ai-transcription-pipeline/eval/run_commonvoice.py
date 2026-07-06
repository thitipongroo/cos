"""Thai WER acceptance harness against a Mozilla Common Voice `th` manifest (spec 30 §375).

Usage (requires `faster-whisper` installed + a Common Voice th export on disk):

    STT_PROVIDER=faster_whisper python -m eval.run_commonvoice \
        --manifest /data/cv-th/validated.tsv --clips /data/cv-th/clips \
        --limit 50 --threshold 0.10 --thai

Not runnable in unit CI: it needs model weights + the audio corpus. The WER math itself is
unit-tested in tests/test_wer.py; this script only wires it to real audio + FasterWhisperProvider.

`--thai` uses `pythainlp.word_tokenize` (must be installed) for word segmentation; otherwise
whitespace tokenization is used. The canonical Thai tokenizer is a pending decision (see wer.py).
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import sys
from pathlib import Path

from eval.wer import evaluate_corpus, whitespace_tokenize
from providers.transcription_provider import FasterWhisperProvider


def _thai_tokenizer():
    from pythainlp.tokenize import word_tokenize  # optional prod dep

    return lambda text: word_tokenize(text, engine="newmm")


async def _run(manifest: str, clips: str, limit: int, threshold: float, thai: bool) -> int:
    provider = FasterWhisperProvider()
    tokenize = _thai_tokenizer() if thai else whitespace_tokenize

    pairs: list[tuple[str, str]] = []
    with open(manifest, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh, delimiter="\t")
        for i, row in enumerate(reader):
            if i >= limit:
                break
            audio = (Path(clips) / row["path"]).read_bytes()
            result = await provider.transcribe(audio, language="th")
            pairs.append((row["sentence"], result.transcript))

    res = evaluate_corpus(pairs, tokenize=tokenize)
    print(f"samples={res.count} mean_WER={res.mean_wer:.4f} threshold={threshold}")
    if res.mean_wer >= threshold:
        print("FAIL: WER at/above threshold (spec 30 §375: < 0.10)", file=sys.stderr)
        return 1
    print("PASS")
    return 0


def main() -> None:
    p = argparse.ArgumentParser(description="Thai WER acceptance harness (Common Voice th).")
    p.add_argument("--manifest", required=True, help="Common Voice TSV (columns: path, sentence)")
    p.add_argument("--clips", required=True, help="directory of audio clips referenced by 'path'")
    p.add_argument("--limit", type=int, default=50)
    p.add_argument("--threshold", type=float, default=0.10)
    p.add_argument("--thai", action="store_true", help="use pythainlp word tokenizer")
    args = p.parse_args()
    raise SystemExit(
        asyncio.run(_run(args.manifest, args.clips, args.limit, args.threshold, args.thai))
    )


if __name__ == "__main__":
    main()
