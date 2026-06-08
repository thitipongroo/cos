from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class OCRResult:
    text: str
    fields: dict[str, str]
    confidence: float


class CloudOCRProvider(ABC):
    """Interface for cloud-based OCR extraction.

    Provider RESOLVED: AWS Textract (AnalyzeDocument API, FORMS feature).
    Auth: IAM role (EKS IRSA) — no separate credentials.
    NOT activated in Phase 11. Trigger: invoice photo OCR pipeline ready.
    Source: docs/specifications/22-ai-architecture.md §22.7 OCR Provider.
    """

    @abstractmethod
    async def extract(self, file_url: str) -> OCRResult: ...


class StubCloudOCRProvider(CloudOCRProvider):
    async def extract(self, file_url: str) -> OCRResult:
        raise NotImplementedError("StubCloudOCRProvider: AWS Textract not yet activated")
