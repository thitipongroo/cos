import io
import re
import statistics
from dataclasses import dataclass

import pytesseract
from pdf2image import convert_from_bytes
from PIL import Image


@dataclass
class OCROutput:
    file_id: str
    extracted_text: str
    confidence_score: float


def extract_text_from_pdf(pdf_bytes: bytes) -> tuple[str, float]:
    images = convert_from_bytes(pdf_bytes)
    texts: list[str] = []
    confidences: list[float] = []

    for image in images:
        page_text, conf = _ocr_image(image)
        texts.append(page_text)
        confidences.append(conf)

    combined_text = "\n\n".join(t for t in texts if t.strip())
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    return combined_text, avg_confidence


def extract_text_from_image(image_bytes: bytes) -> tuple[str, float]:
    image = Image.open(io.BytesIO(image_bytes))
    return _ocr_image(image)


_THAI = re.compile("[\u0e00-\u0e7f]")  # the Thai block
# A gap between two Thai tokens on one line counts as a space when it is wider than this share of
# the line's median token height. Measured on Thai test pages (2026-11-06): gaps inside a word
# reached 12 px, real spaces were 17-28 px, at token heights around 25-30 px.
_THAI_SPACE_GAP = 0.5


def _join_words(data: dict) -> str:
    """Join tesseract's word tokens into text.

    For Thai, tesseract returns one token per character or cluster, and Thai does not put spaces
    between words, so joining every token with a space turned "รายงาน" into "ร า ย ง า น". Two
    adjacent Thai tokens on the same line are therefore joined without a space unless the gap
    between them is wide enough to be a real one. Every other boundary keeps a single space, so
    text without Thai is joined exactly as before.
    """
    tokens = [i for i, w in enumerate(data["text"]) if w.strip()]
    geometry = ("block_num", "par_num", "line_num", "left", "width", "height")
    has_geometry = all(k in data for k in geometry)

    def line(i: int) -> tuple:
        if not has_geometry:
            return ()
        return (data["block_num"][i], data["par_num"][i], data["line_num"][i])

    heights: dict[tuple, list[int]] = {}
    for i in tokens:
        heights.setdefault(line(i), []).append(data["height"][i] if has_geometry else 0)

    parts: list[str] = []
    for n, i in enumerate(tokens):
        if n:
            p = tokens[n - 1]
            sep = " "
            both_thai = _THAI.search(data["text"][p]) and _THAI.search(data["text"][i])
            if line(p) == line(i) and both_thai:
                sep = ""
                if has_geometry:
                    gap = data["left"][i] - (data["left"][p] + data["width"][p])
                    if gap > _THAI_SPACE_GAP * statistics.median(heights[line(i)]):
                        sep = " "
            parts.append(sep)
        parts.append(data["text"][i])
    return "".join(parts)


def _ocr_image(image: Image.Image) -> tuple[str, float]:
    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT, lang="tha+eng")
    confs = [c for c, w in zip(data["conf"], data["text"]) if w.strip() and c != -1]

    text = _join_words(data)
    confidence = sum(confs) / len(confs) / 100.0 if confs else 0.0
    return text, confidence


def process_file(file_id: str, file_bytes: bytes, mime_type: str) -> OCROutput:
    if mime_type == "application/pdf":
        text, confidence = extract_text_from_pdf(file_bytes)
    else:
        text, confidence = extract_text_from_image(file_bytes)

    return OCROutput(file_id=file_id, extracted_text=text, confidence_score=confidence)
