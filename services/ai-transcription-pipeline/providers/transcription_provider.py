"""Speech-to-text provider interface (spec 22-ai-architecture §22.2 — Whisper; 21-mvp-scope
§21.4 Layer A). Callers go through `TranscriptionProvider`; they never import a model SDK
directly (mirrors the EmbeddingProvider convention in ai-embedding-worker)."""
import io
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class TranscriptionResult:
    transcript: str
    language: str
    duration_seconds: float  # billed per-minute at the tenant level (spec 26 §57)


class TranscriptionProvider(ABC):
    @abstractmethod
    async def transcribe(self, audio: bytes, language: str | None = None) -> TranscriptionResult: ...

    @property
    @abstractmethod
    def model_name(self) -> str: ...


class StubTranscriptionProvider(TranscriptionProvider):
    """Default provider until the self-host model is deployed (mirrors StubEmbeddingProvider)."""

    async def transcribe(self, audio: bytes, language: str | None = None) -> TranscriptionResult:
        raise NotImplementedError(
            "StubTranscriptionProvider: real transcription provider not configured"
        )

    @property
    def model_name(self) -> str:
        return "faster-whisper:stub"


class FasterWhisperProvider(TranscriptionProvider):
    """Self-host faster-whisper (the chosen STT provider). `faster-whisper` + model weights are a
    prod/deploy-image dependency, lazy-imported so the base service installs and unit-tests run
    without them. Enabled by setting STT_PROVIDER=faster_whisper (see main.py)."""

    def __init__(
        self,
        model_size: str | None = None,
        device: str | None = None,
        compute_type: str | None = None,
    ):
        self._model_size = model_size or os.environ.get("WHISPER_MODEL_SIZE", "small")
        self._device = device or os.environ.get("WHISPER_DEVICE", "cpu")
        self._compute_type = compute_type or os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
        self._model = None

    def _load(self):
        if self._model is None:
            from faster_whisper import WhisperModel  # lazy: prod-only dependency

            self._model = WhisperModel(
                self._model_size, device=self._device, compute_type=self._compute_type
            )
        return self._model

    async def transcribe(self, audio: bytes, language: str | None = None) -> TranscriptionResult:
        model = self._load()
        segments, info = model.transcribe(io.BytesIO(audio), language=language)
        transcript = " ".join(segment.text.strip() for segment in segments).strip()
        return TranscriptionResult(
            transcript=transcript,
            language=info.language,
            duration_seconds=float(info.duration),
        )

    @property
    def model_name(self) -> str:
        return f"faster-whisper:{self._model_size}"
