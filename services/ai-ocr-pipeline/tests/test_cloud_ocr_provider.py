"""Unit tests for the cloud OCR provider seam (spec §22.7 OCR Provider — AWS Textract).

The provider is deliberately NOT activated in Phase 11: the concrete Textract adapter arrives when
the invoice-photo pipeline is switched on. What is worth pinning down now is the seam itself — that
the stub is a real `CloudOCRProvider`, that it fails loudly rather than returning an empty result
(spec §32.9 Type A integration stubs: log + fail-fast, never silent defaults), and that the
`OCRResult` contract callers will code against is stable.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from providers.cloud_ocr_provider import CloudOCRProvider, OCRResult, StubCloudOCRProvider


class TestOCRResult:
    def test_carries_text_fields_and_confidence(self):
        result = OCRResult(
            text="INVOICE 2026-07",
            fields={"invoice_no": "INV-001", "total": "15000.00"},
            confidence=0.87,
        )
        assert result.text == "INVOICE 2026-07"
        assert result.fields["invoice_no"] == "INV-001"
        assert result.confidence == 0.87

    def test_fields_is_a_mapping_for_the_textract_forms_feature(self):
        # Textract AnalyzeDocument FORMS returns key/value pairs — the contract must keep them keyed.
        result = OCRResult(text="", fields={}, confidence=0.0)
        assert result.fields == {}


class TestStubCloudOCRProvider:
    def test_is_a_cloud_ocr_provider(self):
        assert isinstance(StubCloudOCRProvider(), CloudOCRProvider)

    @pytest.mark.asyncio
    async def test_extract_fails_fast_instead_of_returning_empty_text(self):
        # Type A stub (§32.9): raise, never hand back a plausible-looking empty OCRResult.
        with pytest.raises(NotImplementedError) as exc:
            await StubCloudOCRProvider().extract("https://storage.example/invoice.jpg")

        assert "Textract" in str(exc.value)

    def test_abstract_base_cannot_be_instantiated(self):
        # Keeps `extract` abstract so a future adapter cannot silently skip implementing it.
        with pytest.raises(TypeError):
            CloudOCRProvider()
