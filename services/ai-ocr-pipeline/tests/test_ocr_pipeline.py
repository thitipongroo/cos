import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from ocr_pipeline import OCROutput, process_file, extract_text_from_pdf, extract_text_from_image


def _make_tesseract_data(words: list[str], confs: list[int]) -> dict:
    return {"text": words, "conf": confs}


class TestExtractTextFromImage:
    @patch("ocr_pipeline.pytesseract.image_to_data")
    @patch("ocr_pipeline.Image.open")
    def test_returns_text_and_confidence(self, mock_open, mock_ocr):
        mock_open.return_value = MagicMock()
        mock_ocr.return_value = _make_tesseract_data(
            ["Hello", "World", ""], [90, 80, -1]
        )
        text, conf = extract_text_from_image(b"fake-image-bytes")
        assert "Hello" in text
        assert "World" in text
        assert 0.0 <= conf <= 1.0

    @patch("ocr_pipeline.pytesseract.image_to_data")
    @patch("ocr_pipeline.Image.open")
    def test_empty_page_returns_zero_confidence(self, mock_open, mock_ocr):
        mock_open.return_value = MagicMock()
        mock_ocr.return_value = _make_tesseract_data(["", " "], [-1, -1])
        text, conf = extract_text_from_image(b"blank-image")
        assert conf == 0.0

    @patch("ocr_pipeline.pytesseract.image_to_data")
    @patch("ocr_pipeline.Image.open")
    def test_confidence_normalised_to_0_1(self, mock_open, mock_ocr):
        mock_open.return_value = MagicMock()
        mock_ocr.return_value = _make_tesseract_data(["word"], [100])
        _, conf = extract_text_from_image(b"image")
        assert conf == pytest.approx(1.0)


class TestExtractTextFromPdf:
    @patch("ocr_pipeline.pytesseract.image_to_data")
    @patch("ocr_pipeline.convert_from_bytes")
    def test_multi_page_pdf_concatenated(self, mock_convert, mock_ocr):
        mock_convert.return_value = [MagicMock(), MagicMock()]
        mock_ocr.side_effect = [
            _make_tesseract_data(["Page1"], [85]),
            _make_tesseract_data(["Page2"], [75]),
        ]
        text, conf = extract_text_from_pdf(b"fake-pdf")
        assert "Page1" in text
        assert "Page2" in text
        assert conf == pytest.approx((85 + 75) / 2 / 100.0)

    @patch("ocr_pipeline.pytesseract.image_to_data")
    @patch("ocr_pipeline.convert_from_bytes")
    def test_single_page_pdf(self, mock_convert, mock_ocr):
        mock_convert.return_value = [MagicMock()]
        mock_ocr.return_value = _make_tesseract_data(["Invoice", "Total"], [90, 88])
        text, conf = extract_text_from_pdf(b"pdf-bytes")
        assert "Invoice" in text


class TestProcessFile:
    @patch("ocr_pipeline.pytesseract.image_to_data")
    @patch("ocr_pipeline.Image.open")
    def test_jpeg_dispatches_to_image(self, mock_open, mock_ocr):
        mock_open.return_value = MagicMock()
        mock_ocr.return_value = _make_tesseract_data(["photo"], [80])
        result = process_file("file-001", b"jpg-bytes", "image/jpeg")
        assert isinstance(result, OCROutput)
        assert result.file_id == "file-001"

    @patch("ocr_pipeline.pytesseract.image_to_data")
    @patch("ocr_pipeline.convert_from_bytes")
    def test_pdf_dispatches_to_pdf(self, mock_convert, mock_ocr):
        mock_convert.return_value = [MagicMock()]
        mock_ocr.return_value = _make_tesseract_data(["doc"], [70])
        result = process_file("file-002", b"pdf-bytes", "application/pdf")
        assert result.file_id == "file-002"

    @patch("ocr_pipeline.pytesseract.image_to_data")
    @patch("ocr_pipeline.Image.open")
    def test_png_dispatches_to_image(self, mock_open, mock_ocr):
        mock_open.return_value = MagicMock()
        mock_ocr.return_value = _make_tesseract_data(["png"], [75])
        result = process_file("file-003", b"png-bytes", "image/png")
        assert result.file_id == "file-003"

    @patch("ocr_pipeline.pytesseract.image_to_data")
    @patch("ocr_pipeline.Image.open")
    def test_output_has_confidence_score(self, mock_open, mock_ocr):
        mock_open.return_value = MagicMock()
        mock_ocr.return_value = _make_tesseract_data(["text"], [60])
        result = process_file("file-004", b"bytes", "image/jpeg")
        assert 0.0 <= result.confidence_score <= 1.0
