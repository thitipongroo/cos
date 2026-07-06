import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import _billed_minutes, _usage_record


class TestBilledMinutes:
    def test_rounds_up_to_whole_minutes(self):
        assert _billed_minutes(1.0) == 1
        assert _billed_minutes(59.9) == 1
        assert _billed_minutes(60.0) == 1
        assert _billed_minutes(60.1) == 2
        assert _billed_minutes(61.0) == 2
        assert _billed_minutes(150.0) == 3

    def test_empty_audio_is_zero(self):
        assert _billed_minutes(0) == 0
        assert _billed_minutes(-1) == 0


class TestUsageRecord:
    def test_shape_is_per_minute_tenant_scoped(self):
        assert _usage_record("tenant-1", 3) == {
            "tenant_id": "tenant-1",
            "service": "ai.transcription",
            "unit": "minute",
            "quantity": 3,
        }
