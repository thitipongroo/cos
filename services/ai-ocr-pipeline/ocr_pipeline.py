import io
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


def _ocr_image(image: Image.Image) -> tuple[str, float]:
    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT, lang="tha+eng")
    words = [w for w in data["text"] if w.strip()]
    confs = [c for c, w in zip(data["conf"], data["text"]) if w.strip() and c != -1]

    text = " ".join(words)
    confidence = sum(confs) / len(confs) / 100.0 if confs else 0.0
    return text, confidence


def process_file(file_id: str, file_bytes: bytes, mime_type: str) -> OCROutput:
    if mime_type == "application/pdf":
        text, confidence = extract_text_from_pdf(file_bytes)
    else:
        text, confidence = extract_text_from_image(file_bytes)

    return OCROutput(file_id=file_id, extracted_text=text, confidence_score=confidence)
