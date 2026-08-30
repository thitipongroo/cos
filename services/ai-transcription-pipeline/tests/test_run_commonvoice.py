"""Unit tests for the Thai WER acceptance harness — spec 30 §375.

§35.13 ESC-24: eval/run_commonvoice.py was entirely uncovered (41 statements). Its own docstring
says it is "not runnable in unit CI" because it needs model weights and the Common Voice corpus —
but that is an argument for faking those two inputs, not for leaving the wiring untested. The
orchestration (read the manifest, honour --limit, evaluate, compare against the threshold, pick an
exit code) is ordinary logic and is what these cover.
"""

import asyncio
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from eval import run_commonvoice
from providers.transcription_provider import TranscriptionResult


class _ScriptedProvider:
    """Returns a queued transcript per call, so WER is deterministic."""

    def __init__(self, transcripts: list[str]):
        self._transcripts = list(transcripts)
        self.calls: list[tuple[bytes, str | None]] = []

    async def transcribe(self, audio: bytes, language: str | None = None) -> TranscriptionResult:
        self.calls.append((audio, language))
        return TranscriptionResult(
            transcript=self._transcripts.pop(0), language="th", duration_seconds=1.0
        )


def _corpus(tmp_path: Path, rows: list[tuple[str, str]]) -> tuple[str, str]:
    """Writes a Common Voice-shaped TSV plus its clips; returns (manifest, clips_dir)."""
    clips = tmp_path / "clips"
    clips.mkdir()
    lines = ["path\tsentence"]
    for name, sentence in rows:
        (clips / name).write_bytes(b"AUDIO-" + name.encode())
        lines.append(f"{name}\t{sentence}")
    manifest = tmp_path / "validated.tsv"
    manifest.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return str(manifest), str(clips)


class TestThaiTokenizer:
    def test_returns_a_pythainlp_backed_tokenizer(self, monkeypatch):
        """pythainlp is an optional prod dep, so the import is faked rather than installed."""
        seen: list[dict] = []

        def word_tokenize(text, engine=None):
            seen.append({"text": text, "engine": engine})
            return text.split()

        module = types.ModuleType("pythainlp.tokenize")
        module.word_tokenize = word_tokenize
        parent = types.ModuleType("pythainlp")
        parent.tokenize = module
        monkeypatch.setitem(sys.modules, "pythainlp", parent)
        monkeypatch.setitem(sys.modules, "pythainlp.tokenize", module)

        tokenize = run_commonvoice._thai_tokenizer()
        assert tokenize("a b") == ["a", "b"]
        assert seen == [{"text": "a b", "engine": "newmm"}]


class TestRun:
    @pytest.mark.asyncio
    async def test_returns_0_when_wer_is_below_the_threshold(self, tmp_path, monkeypatch, capsys):
        manifest, clips = _corpus(tmp_path, [("a.mp3", "hello world"), ("b.mp3", "good morning")])
        provider = _ScriptedProvider(["hello world", "good morning"])  # perfect transcripts → WER 0
        monkeypatch.setattr(run_commonvoice, "FasterWhisperProvider", lambda: provider)

        code = await run_commonvoice._run(manifest, clips, limit=50, threshold=0.10, thai=False)

        assert code == 0
        out = capsys.readouterr().out
        assert "samples=2" in out
        assert "mean_WER=0.0000" in out
        assert "PASS" in out
        # the audio bytes come from the clips directory, and Thai is requested explicitly
        assert provider.calls[0] == (b"AUDIO-a.mp3", "th")

    @pytest.mark.asyncio
    async def test_returns_1_when_wer_reaches_the_threshold(self, tmp_path, monkeypatch, capsys):
        manifest, clips = _corpus(tmp_path, [("a.mp3", "hello world")])
        provider = _ScriptedProvider(["totally different text"])
        monkeypatch.setattr(run_commonvoice, "FasterWhisperProvider", lambda: provider)

        code = await run_commonvoice._run(manifest, clips, limit=50, threshold=0.10, thai=False)

        assert code == 1
        captured = capsys.readouterr()
        assert "FAIL" in captured.err
        assert "spec 30 §375" in captured.err

    @pytest.mark.asyncio
    async def test_honours_the_limit(self, tmp_path, monkeypatch):
        rows = [(f"{i}.mp3", "same words here") for i in range(5)]
        manifest, clips = _corpus(tmp_path, rows)
        provider = _ScriptedProvider(["same words here"] * 5)
        monkeypatch.setattr(run_commonvoice, "FasterWhisperProvider", lambda: provider)

        await run_commonvoice._run(manifest, clips, limit=2, threshold=1.0, thai=False)

        assert len(provider.calls) == 2

    @pytest.mark.asyncio
    async def test_uses_the_thai_tokenizer_when_asked(self, tmp_path, monkeypatch):
        manifest, clips = _corpus(tmp_path, [("a.mp3", "hello world")])
        provider = _ScriptedProvider(["hello world"])
        monkeypatch.setattr(run_commonvoice, "FasterWhisperProvider", lambda: provider)

        used: list[str] = []

        def fake_thai_tokenizer():
            used.append("thai")
            return lambda text: text.split()

        monkeypatch.setattr(run_commonvoice, "_thai_tokenizer", fake_thai_tokenizer)

        await run_commonvoice._run(manifest, clips, limit=50, threshold=1.0, thai=True)

        assert used == ["thai"]


def _run_and_close(coro):
    """Stand-in for asyncio.run that guarantees the loop is closed.

    main() calls asyncio.run(); under pytest-asyncio's auto mode that leaves a loop for the GC to
    collect, and the ResourceWarning it emits is an ERROR here (pytest.ini filterwarnings = error).
    Running the coroutine on a loop this helper owns keeps main() fully exercised without the leak.
    """
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


class TestMain:
    def test_parses_arguments_and_exits_with_the_run_code(self, tmp_path, monkeypatch):
        manifest, clips = _corpus(tmp_path, [("a.mp3", "hello world")])
        provider = _ScriptedProvider(["hello world"])
        monkeypatch.setattr(run_commonvoice, "FasterWhisperProvider", lambda: provider)
        monkeypatch.setattr(
            sys,
            "argv",
            ["run_commonvoice", "--manifest", manifest, "--clips", clips, "--limit", "1"],
        )

        monkeypatch.setattr(run_commonvoice.asyncio, "run", _run_and_close)

        with pytest.raises(SystemExit) as exc:
            run_commonvoice.main()

        assert exc.value.code == 0

    def test_exits_nonzero_when_the_corpus_fails_the_threshold(self, tmp_path, monkeypatch):
        manifest, clips = _corpus(tmp_path, [("a.mp3", "hello world")])
        provider = _ScriptedProvider(["nothing alike at all"])
        monkeypatch.setattr(run_commonvoice, "FasterWhisperProvider", lambda: provider)
        monkeypatch.setattr(
            sys,
            "argv",
            ["run_commonvoice", "--manifest", manifest, "--clips", clips, "--threshold", "0.10"],
        )

        monkeypatch.setattr(run_commonvoice.asyncio, "run", _run_and_close)

        with pytest.raises(SystemExit) as exc:
            run_commonvoice.main()

        assert exc.value.code == 1

    def test_manifest_and_clips_are_required(self, monkeypatch):
        monkeypatch.setattr(sys, "argv", ["run_commonvoice"])
        monkeypatch.setattr(run_commonvoice.asyncio, "run", _run_and_close)

        with pytest.raises(SystemExit) as exc:
            run_commonvoice.main()
        assert exc.value.code == 2  # argparse usage error
