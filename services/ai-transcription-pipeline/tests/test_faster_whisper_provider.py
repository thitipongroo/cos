"""Unit tests for FasterWhisperProvider — no model weights, no `faster-whisper` install.

`faster-whisper` is a prod/deploy-image dependency that the base service deliberately does not
install (see the provider docstring), so the real `WhisperModel` is never constructed here. The lazy
`from faster_whisper import WhisperModel` inside `_load()` is satisfied by injecting a fake module
into `sys.modules`, which is what makes the transcribe path testable at all: the import only happens
on first use, so a test can substitute it before the first call.
"""
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
    def __init__(self, language: str = "th", duration: float = 3.5):
        self.language = language
        self.duration = duration


class _FakeWhisperModel:
    """Records how it was constructed so the env-driven config can be asserted."""

    constructed_with: dict = {}

    def __init__(self, model_size, device=None, compute_type=None):
        type(self).constructed_with = {
            "model_size": model_size,
            "device": device,
            "compute_type": compute_type,
        }
        self.transcribe_calls: list = []

    def transcribe(self, audio_stream, language=None):
        self.transcribe_calls.append((audio_stream, language))
        # Deliberately padded — transcribe() must strip each segment and join with single spaces.
        return [_FakeSegment("  สวัสดี  "), _FakeSegment(" ครับ ")], _FakeInfo()


@pytest.fixture
def fake_faster_whisper(monkeypatch):
    module = types.ModuleType("faster_whisper")
    module.WhisperModel = _FakeWhisperModel
    monkeypatch.setitem(sys.modules, "faster_whisper", module)
    _FakeWhisperModel.constructed_with = {}
    return module


class TestConstructorConfig:
    def test_is_transcription_provider_subclass(self):
        assert isinstance(FasterWhisperProvider(), TranscriptionProvider)

    def test_defaults_come_from_environment(self, monkeypatch):
        monkeypatch.setenv("WHISPER_MODEL_SIZE", "large-v3")
        monkeypatch.setenv("WHISPER_DEVICE", "cuda")
        monkeypatch.setenv("WHISPER_COMPUTE_TYPE", "float16")
        provider = FasterWhisperProvider()
        assert provider.model_name == "faster-whisper:large-v3"
        assert provider._device == "cuda"
        assert provider._compute_type == "float16"

    def test_falls_back_to_documented_defaults_when_env_absent(self, monkeypatch):
        for var in ("WHISPER_MODEL_SIZE", "WHISPER_DEVICE", "WHISPER_COMPUTE_TYPE"):
            monkeypatch.delenv(var, raising=False)
        provider = FasterWhisperProvider()
        assert provider.model_name == "faster-whisper:small"
        assert provider._device == "cpu"
        assert provider._compute_type == "int8"

    def test_explicit_arguments_win_over_environment(self, monkeypatch):
        monkeypatch.setenv("WHISPER_MODEL_SIZE", "large-v3")
        provider = FasterWhisperProvider(model_size="tiny", device="cpu", compute_type="int8")
        assert provider.model_name == "faster-whisper:tiny"


class TestModelLoading:
    def test_load_constructs_model_with_configured_values(self, fake_faster_whisper):
        provider = FasterWhisperProvider(model_size="tiny", device="cpu", compute_type="int8")
        provider._load()
        assert _FakeWhisperModel.constructed_with == {
            "model_size": "tiny",
            "device": "cpu",
            "compute_type": "int8",
        }

    def test_model_is_loaded_once_and_reused(self, fake_faster_whisper):
        # The weights are hundreds of MB; reloading per request would be a latency bug.
        provider = FasterWhisperProvider(model_size="tiny")
        assert provider._load() is provider._load()

    def test_injected_model_is_not_reloaded(self, fake_faster_whisper):
        provider = FasterWhisperProvider()
        sentinel = _FakeWhisperModel("preloaded")
        provider._model = sentinel
        assert provider._load() is sentinel


class TestTranscribe:
    @pytest.mark.asyncio
    async def test_joins_stripped_segments_and_reports_language_and_duration(
        self, fake_faster_whisper
    ):
        provider = FasterWhisperProvider(model_size="tiny")
        result = await provider.transcribe(b"audio-bytes", language="th")

        assert isinstance(result, TranscriptionResult)
        assert result.transcript == "สวัสดี ครับ"
        assert result.language == "th"
        assert result.duration_seconds == 3.5
        assert isinstance(result.duration_seconds, float)

    @pytest.mark.asyncio
    async def test_passes_language_through_and_wraps_audio_in_a_stream(self, fake_faster_whisper):
        provider = FasterWhisperProvider(model_size="tiny")
        await provider.transcribe(b"audio-bytes", language="en")

        audio_stream, language = provider._model.transcribe_calls[0]
        assert language == "en"
        # faster-whisper takes a file-like object, not raw bytes.
        assert audio_stream.read() == b"audio-bytes"

    @pytest.mark.asyncio
    async def test_language_defaults_to_none_for_autodetect(self, fake_faster_whisper):
        provider = FasterWhisperProvider(model_size="tiny")
        await provider.transcribe(b"audio-bytes")
        assert provider._model.transcribe_calls[0][1] is None
