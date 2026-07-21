"""Unit tests for the Thai WER acceptance harness.

The module's own docstring says it is "not runnable in unit CI: it needs model weights + the audio
corpus". That is true of running it for real — but the wiring around the WER math (manifest parsing,
the `--limit` cut-off, tokenizer selection, and the pass/fail exit contract of spec 30 §375) is
ordinary logic and is what these tests pin down. Both heavyweight edges are substituted:
`FasterWhisperProvider` is patched at the name the module imported it under, and the optional
`pythainlp` dependency is injected into `sys.modules`, since it is not installed in this service.
"""
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from eval import run_commonvoice


class _FakeProvider:
    """Returns a queued transcript per call, so a fixture can dial the resulting WER exactly."""

    def __init__(self, transcripts=None):
        self.transcripts = list(transcripts or [])
        self.calls: list = []

    async def transcribe(self, audio, language=None):
        self.calls.append((audio, language))
        text = self.transcripts.pop(0) if self.transcripts else ""
        return types.SimpleNamespace(transcript=text, language="th", duration_seconds=1.0)


def _write_corpus(tmp_path: Path, rows: list[tuple[str, str]]) -> tuple[str, str]:
    """Write a Common Voice-shaped TSV plus its clips dir. rows = [(filename, sentence)]."""
    clips = tmp_path / "clips"
    clips.mkdir()
    lines = ["path\tsentence"]
    for name, sentence in rows:
        (clips / name).write_bytes(b"fake-audio")
        lines.append(f"{name}\t{sentence}")
    manifest = tmp_path / "validated.tsv"
    manifest.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return str(manifest), str(clips)


class TestThaiTokenizer:
    def test_uses_pythainlp_newmm_engine(self, monkeypatch):
        captured = {}

        def fake_word_tokenize(text, engine=None):
            captured["engine"] = engine
            return text.split("|")

        module = types.ModuleType("pythainlp.tokenize")
        module.word_tokenize = fake_word_tokenize
        parent = types.ModuleType("pythainlp")
        parent.tokenize = module
        monkeypatch.setitem(sys.modules, "pythainlp", parent)
        monkeypatch.setitem(sys.modules, "pythainlp.tokenize", module)

        tokenize = run_commonvoice._thai_tokenizer()

        assert tokenize("ก|ข|ค") == ["ก", "ข", "ค"]
        # newmm is the engine the module documents; a silent change would alter WER results.
        assert captured["engine"] == "newmm"


class TestRun:
    """`_run` is awaited directly rather than driven with `asyncio.run`.

    pytest.ini sets `asyncio_mode = auto`, so pytest-asyncio already provides a managed loop. Calling
    `asyncio.run` inside a sync test spins up a second loop whose self-pipe socketpair is reported as
    an unclosed-resource ResourceWarning, and `filterwarnings = error` turns that into a failure —
    with every assertion still passing, which makes it a confusing way to fail.
    """

    @pytest.mark.asyncio
    async def test_passes_when_transcripts_match_and_returns_zero(self, tmp_path, monkeypatch):
        manifest, clips = _write_corpus(tmp_path, [("a.mp3", "one two"), ("b.mp3", "three four")])
        provider = _FakeProvider(["one two", "three four"])
        monkeypatch.setattr(run_commonvoice, "FasterWhisperProvider", lambda: provider)

        code = await run_commonvoice._run(manifest, clips, 50, 0.10, thai=False)

        assert code == 0
        assert len(provider.calls) == 2
        assert provider.calls[0] == (b"fake-audio", "th")

    @pytest.mark.asyncio
    async def test_fails_when_wer_at_or_above_threshold(self, tmp_path, monkeypatch, capsys):
        manifest, clips = _write_corpus(tmp_path, [("a.mp3", "one two three four")])
        provider = _FakeProvider(["completely different words here"])
        monkeypatch.setattr(run_commonvoice, "FasterWhisperProvider", lambda: provider)

        code = await run_commonvoice._run(manifest, clips, 50, 0.10, thai=False)

        assert code == 1
        assert "FAIL" in capsys.readouterr().err

    @pytest.mark.asyncio
    async def test_threshold_is_exclusive_so_equal_wer_fails(self, tmp_path, monkeypatch):
        # spec 30 §375 requires WER < 0.10 — exactly 0.10 must not pass.
        manifest, clips = _write_corpus(tmp_path, [("a.mp3", "a b c d e f g h i j")])
        provider = _FakeProvider(["a b c d e f g h i x"])  # 1 substitution / 10 words = 0.10
        monkeypatch.setattr(run_commonvoice, "FasterWhisperProvider", lambda: provider)

        assert await run_commonvoice._run(manifest, clips, 50, 0.10, thai=False) == 1

    @pytest.mark.asyncio
    async def test_limit_caps_the_number_of_samples(self, tmp_path, monkeypatch):
        rows = [(f"{i}.mp3", "one two") for i in range(5)]
        manifest, clips = _write_corpus(tmp_path, rows)
        provider = _FakeProvider(["one two"] * 5)
        monkeypatch.setattr(run_commonvoice, "FasterWhisperProvider", lambda: provider)

        await run_commonvoice._run(manifest, clips, 2, 0.10, thai=False)

        assert len(provider.calls) == 2

    @pytest.mark.asyncio
    async def test_prints_sample_count_and_mean_wer(self, tmp_path, monkeypatch, capsys):
        manifest, clips = _write_corpus(tmp_path, [("a.mp3", "one two")])
        provider = _FakeProvider(["one two"])
        monkeypatch.setattr(run_commonvoice, "FasterWhisperProvider", lambda: provider)

        await run_commonvoice._run(manifest, clips, 50, 0.10, thai=False)

        out = capsys.readouterr().out
        assert "samples=1" in out
        assert "mean_WER=0.0000" in out
        assert "PASS" in out

    @pytest.mark.asyncio
    async def test_thai_flag_selects_the_pythainlp_tokenizer(self, tmp_path, monkeypatch):
        manifest, clips = _write_corpus(tmp_path, [("a.mp3", "หนึ่ง สอง")])
        provider = _FakeProvider(["หนึ่ง สอง"])
        monkeypatch.setattr(run_commonvoice, "FasterWhisperProvider", lambda: provider)
        used = {"called": False}

        def fake_thai_tokenizer():
            used["called"] = True
            return str.split

        monkeypatch.setattr(run_commonvoice, "_thai_tokenizer", fake_thai_tokenizer)

        await run_commonvoice._run(manifest, clips, 50, 0.10, thai=True)

        assert used["called"] is True


def _drive(coro):
    """Run a non-awaiting coroutine to completion without opening an event loop.

    `main()` calls `asyncio.run(...)`. Left alone that opens a second loop inside a session where
    pytest-asyncio already manages one, and the loser's self-pipe socketpair is collected later as an
    unraisable ResourceWarning — which `filterwarnings = error` turns into a failure. The symptom is
    nasty: each class passes alone and only the combination fails. The test doubles below never
    await, so a single `send(None)` completes them and `main()`'s contract (parse args → exit with
    the returned code) is still exercised end to end.
    """
    try:
        coro.send(None)
    except StopIteration as stop:
        return stop.value
    raise AssertionError("test double awaited something; it must complete synchronously")


@pytest.fixture
def no_nested_loop(monkeypatch):
    monkeypatch.setattr(run_commonvoice.asyncio, "run", _drive)


class TestMain:
    def test_parses_arguments_and_exits_with_the_run_code(
        self, monkeypatch, tmp_path, no_nested_loop
    ):
        captured = {}

        async def fake_run(manifest, clips, limit, threshold, thai):
            captured.update(
                manifest=manifest, clips=clips, limit=limit, threshold=threshold, thai=thai
            )
            return 0

        monkeypatch.setattr(run_commonvoice, "_run", fake_run)
        monkeypatch.setattr(
            sys,
            "argv",
            [
                "run_commonvoice",
                "--manifest",
                str(tmp_path / "m.tsv"),
                "--clips",
                str(tmp_path / "clips"),
                "--limit",
                "7",
                "--threshold",
                "0.25",
                "--thai",
            ],
        )

        with pytest.raises(SystemExit) as exc:
            run_commonvoice.main()

        assert exc.value.code == 0
        assert captured["limit"] == 7
        assert captured["threshold"] == 0.25
        assert captured["thai"] is True

    def test_defaults_match_the_documented_usage(self, monkeypatch, tmp_path, no_nested_loop):
        captured = {}

        async def fake_run(manifest, clips, limit, threshold, thai):
            captured.update(limit=limit, threshold=threshold, thai=thai)
            return 0

        monkeypatch.setattr(run_commonvoice, "_run", fake_run)
        monkeypatch.setattr(
            sys,
            "argv",
            ["run_commonvoice", "--manifest", "m.tsv", "--clips", "clips"],
        )

        with pytest.raises(SystemExit):
            run_commonvoice.main()

        assert captured == {"limit": 50, "threshold": 0.10, "thai": False}

    def test_nonzero_run_code_propagates_to_the_exit_status(self, monkeypatch, no_nested_loop):
        async def fake_run(*_args):
            return 1

        monkeypatch.setattr(run_commonvoice, "_run", fake_run)
        monkeypatch.setattr(
            sys, "argv", ["run_commonvoice", "--manifest", "m.tsv", "--clips", "clips"]
        )

        with pytest.raises(SystemExit) as exc:
            run_commonvoice.main()

        assert exc.value.code == 1
