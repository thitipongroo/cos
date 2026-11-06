import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from ocr_pipeline import (
    OCROutput,
    _join_words,
    extract_text_from_image,
    extract_text_from_pdf,
    process_file,
)


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


def _geo(
    words: list[str], lefts: list[int], widths: list[int], lines: list[int], height: int = 24
) -> dict:
    """tesseract's image_to_data dict with the geometry _join_words reads."""
    n = len(words)
    return {
        "text": words,
        "conf": [90] * n,
        "block_num": [1] * n,
        "par_num": [1] * n,
        "line_num": lines,
        "left": lefts,
        "width": widths,
        "height": [height] * n,
    }


class TestJoinWords:
    # tesseract returns one token per Thai character or cluster; joining them all with spaces
    # turned "รายงาน" into "ร า ย ง า น" (measured 2026-11-06 once the image had Thai data).
    def test_thai_tokens_with_small_gaps_join_without_spaces(self):
        data = _geo(["ร", "า", "ย", "ง", "า", "น"], [0, 14, 28, 42, 56, 70], [10] * 6, [1] * 6)
        assert _join_words(data) == "รายงาน"

    def test_a_wide_gap_between_thai_tokens_stays_a_space(self):
        # gap 30 px > 0.5 x 24 px median height
        data = _geo(["วัน", "พฤศจิกายน"], [0, 70], [40, 120], [1, 1])
        assert _join_words(data) == "วัน พฤศจิกายน"

    def test_thai_next_to_latin_keeps_a_space(self):
        data = _geo(["ชั้น", "3", "Concrete"], [0, 42, 60], [40, 10, 90], [1, 1, 1])
        assert _join_words(data) == "ชั้น 3 Concrete"

    def test_thai_tokens_on_different_lines_keep_a_space(self):
        data = _geo(["งาน", "ตรวจ"], [0, 0], [40, 40], [1, 2])
        assert _join_words(data) == "งาน ตรวจ"

    def test_without_geometry_thai_tokens_still_join(self):
        assert _join_words({"text": ["ร", "า", "ย"], "conf": [90, 90, 90]}) == "ราย"

    def test_text_without_thai_is_joined_as_before(self):
        data = _geo(["Daily", "report", "2026-11-06"], [0, 80, 200], [70, 100, 160], [1, 1, 1])
        assert _join_words(data) == "Daily report 2026-11-06"

    def test_empty_level_tokens_between_words_are_skipped(self):
        # tesseract emits '' tokens for its block / paragraph / line levels between the words
        data = _geo(["", "ร", "", "า", "ย"], [0, 0, 0, 14, 28], [0, 10, 0, 10, 10], [1, 1, 1, 1, 1])
        assert _join_words(data) == "ราย"

    def test_same_line_number_in_another_block_keeps_a_space(self):
        data = _geo(["งาน", "ตรวจ"], [0, 44], [40, 40], [1, 1])
        data["block_num"] = [1, 2]
        assert _join_words(data) == "งาน ตรวจ"

    def test_thai_digits_join_by_the_gap_rule(self):
        data = _geo(["ที่", "๓", "ชั้น"], [0, 36, 80], [30, 12, 40], [1, 1, 1])
        assert _join_words(data) == "ที่๓ ชั้น"
