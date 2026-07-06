import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from providers.transcription_provider import (
    StubTranscriptionProvider,
    TranscriptionProvider,
    TranscriptionResult,
)


class TestStubTranscriptionProvider:
    def test_is_transcription_provider_subclass(self):
        assert isinstance(StubTranscriptionProvider(), TranscriptionProvider)

    @pytest.mark.asyncio
    async def test_transcribe_raises_not_implemented(self):
        with pytest.raises(NotImplementedError):
            await StubTranscriptionProvider().transcribe(b"audio-bytes")

    @pytest.mark.asyncio
    async def test_transcribe_raises_with_language(self):
        with pytest.raises(NotImplementedError):
            await StubTranscriptionProvider().transcribe(b"audio-bytes", language="th")

    def test_model_name(self):
        assert StubTranscriptionProvider().model_name == "faster-whisper:stub"


class TestTranscriptionResult:
    def test_carries_transcript_language_and_duration(self):
        result = TranscriptionResult(transcript="สวัสดี", language="th", duration_seconds=2.5)
        assert result.transcript == "สวัสดี"
        assert result.language == "th"
        assert result.duration_seconds == 2.5
