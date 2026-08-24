"""Unit tests for FasterWhisperProvider — spec 22-ai-architecture §22.2.

§35.13 ESC-24: 13 statements in providers/transcription_provider.py were uncovered — the whole
FasterWhisperProvider. `faster-whisper` is a prod-image dependency that is deliberately NOT
installed for unit tests (hence the lazy import inside _load), so these tests inject a fake module
into sys.modules. That exercises the real lazy-import path rather than skipping it.
"""

import io
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from providers.transcription_provider import (
    FasterWhisperProvider,
    TranscriptionProvider,
    TranscriptionResult,
)



class _FakeSegment:
    def __init__(self, text: str):
        self.text = text


class _FakeInfo:
    def __init__(self, language: str = "th", duration: float = 8.0):
        self.language = language
        self.duration = duration


class _FakeWhisperModel:
    """Records how it was constructed so the env-var wiring can be asserted."""

    constructed: list[dict] = []

    def __init__(self, model_size, device=None, compute_type=None):
        type(self).constructed.append(
            {"model_size": model_size, "device": device, "compute_type": compute_type}
        )
        self.transcribe_calls: list[tuple[object, str | None]] = []

    def transcribe(self, audio, language=None):
        self.transcribe_calls.append((audio, language))
        return [_FakeSegment("  เท "), _FakeSegment("คอนกรีต  ")], _FakeInfo()


@pytest.fixture
def fake_faster_whisper(monkeypatch):
    """Installs a stand-in `faster_whisper` module for the duration of one test."""
    _FakeWhisperModel.constructed = []
    module = types.ModuleType("faster_whisper")
    module.WhisperModel = _FakeWhisperModel
    monkeypatch.setitem(sys.modules, "faster_whisper", module)
    return module


class TestConstruction:
    def test_uses_the_documented_defaults_when_env_is_unset(self, monkeypatch):
        for key in ("WHISPER_MODEL_SIZE", "WHISPER_DEVICE", "WHISPER_COMPUTE_TYPE"):
            monkeypatch.delenv(key, raising=False)
        p = FasterWhisperProvider()
        assert p._model_size == "small"
        assert p._device == "cpu"
        assert p._compute_type == "int8"
        assert p._model is None  # nothing is loaded until the first transcribe

    def test_reads_the_env_overrides(self, monkeypatch):
        monkeypatch.setenv("WHISPER_MODEL_SIZE", "large-v3")
        monkeypatch.setenv("WHISPER_DEVICE", "cuda")
        monkeypatch.setenv("WHISPER_COMPUTE_TYPE", "float16")
        p = FasterWhisperProvider()
        assert (p._model_size, p._device, p._compute_type) == ("large-v3", "cuda", "float16")

    def test_explicit_arguments_win_over_env(self, monkeypatch):
        monkeypatch.setenv("WHISPER_MODEL_SIZE", "large-v3")
        p = FasterWhisperProvider(model_size="medium", device="cuda", compute_type="float32")
        assert (p._model_size, p._device, p._compute_type) == ("medium", "cuda", "float32")


class TestModelName:
    def test_reports_the_configured_size(self, monkeypatch):
        monkeypatch.delenv("WHISPER_MODEL_SIZE", raising=False)
        assert FasterWhisperProvider().model_name == "faster-whisper:small"
        assert FasterWhisperProvider(model_size="medium").model_name == "faster-whisper:medium"


class TestLoad:
    def test_constructs_the_model_with_the_configured_settings(self, fake_faster_whisper):
        p = FasterWhisperProvider(model_size="medium", device="cuda", compute_type="float16")
        model = p._load()
        assert isinstance(model, _FakeWhisperModel)
        assert _FakeWhisperModel.constructed == [
            {"model_size": "medium", "device": "cuda", "compute_type": "float16"}
        ]

    def test_is_memoised_so_the_weights_load_once(self, fake_faster_whisper):
        p = FasterWhisperProvider()
        first = p._load()
        second = p._load()
        assert first is second
        assert len(_FakeWhisperModel.constructed) == 1


class TestTranscribe:
    @pytest.mark.asyncio
    async def test_joins_and_strips_segments(self, fake_faster_whisper):
        p = FasterWhisperProvider()
        result = await p.transcribe(b"AUDIO", language="th")

        assert isinstance(result, TranscriptionResult)
        # each segment is stripped, then joined with a single space
        assert result.transcript == "เท คอนกรีต"
        assert result.language == "th"
        assert result.duration_seconds == 8.0

    @pytest.mark.asyncio
    async def test_wraps_the_audio_bytes_and_forwards_the_language(self, fake_faster_whisper):
        p = FasterWhisperProvider()
        await p.transcribe(b"AUDIO", language="en")

        model = p._model
        audio_arg, language_arg = model.transcribe_calls[0]
        assert isinstance(audio_arg, io.BytesIO)
        assert audio_arg.getvalue() == b"AUDIO"
        assert language_arg == "en"

    @pytest.mark.asyncio
    async def test_language_may_be_omitted(self, fake_faster_whisper):
        p = FasterWhisperProvider()
        await p.transcribe(b"AUDIO")
        assert p._model.transcribe_calls[0][1] is None
