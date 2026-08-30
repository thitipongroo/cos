"""Unit tests for the cloud OCR provider interface — Phase 11.

§35.13 ESC-24: providers/cloud_ocr_provider.py had no test, so its 11 statements counted against
the QM-1 gate. The module is deliberately inert (AWS Textract is RESOLVED but NOT activated —
docs/specifications/22-ai-architecture.md §22.7), so these tests pin the contract that keeps it
inert: the stub must refuse loudly rather than return an empty result that reads as a successful
extraction with no text.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from providers.cloud_ocr_provider import CloudOCRProvider, OCRResult, StubCloudOCRProvider


class TestOCRResult:
    def test_carries_text_fields_and_confidence(self):
        result = OCRResult(text="INVOICE", fields={"total": "1500.00"}, confidence=0.91)
        assert result.text == "INVOICE"
        assert result.fields == {"total": "1500.00"}
        assert result.confidence == 0.91

    def test_is_a_value_object(self):
        a = OCRResult(text="x", fields={}, confidence=0.5)
        b = OCRResult(text="x", fields={}, confidence=0.5)
        assert a == b


class TestCloudOCRProvider:
    def test_cannot_be_instantiated_directly(self):
        with pytest.raises(TypeError):
            CloudOCRProvider()  # type: ignore[abstract]

    def test_a_subclass_must_implement_extract(self):
        class Incomplete(CloudOCRProvider):
            pass

        with pytest.raises(TypeError):
            Incomplete()  # type: ignore[abstract]


class TestStubCloudOCRProvider:
    def test_is_constructible(self):
        assert isinstance(StubCloudOCRProvider(), CloudOCRProvider)

    @pytest.mark.asyncio
    async def test_extract_refuses_rather_than_returning_an_empty_result(self):
        provider = StubCloudOCRProvider()
        with pytest.raises(NotImplementedError, match="Textract not yet activated"):
            await provider.extract("https://s3.example/invoice.jpg")
