"""
Extension Point Stub Base — Python
Source: context/00_master_construction_os.md §EXTENSION POINT PROTOCOL
Every extension_point() stub MUST extend this class and call log_stub_call().
"""

import logging
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger("cos.extension-points")


class StubBase(ABC):
    @property
    @abstractmethod
    def EP_ID(self) -> str: ...

    @property
    @abstractmethod
    def EP_VERSION(self) -> str: ...

    @property
    @abstractmethod
    def TRIGGER(self) -> str: ...

    @property
    @abstractmethod
    def PHASE(self) -> str: ...

    def log_stub_call(self, method_name: str, context: dict[str, Any] | None = None) -> None:
        """Must be called at the start of every stub method — emits WARN so stubs are visible."""
        logger.warning(
            "[STUB] %s#%s called — implement when: %s",
            self.EP_ID,
            method_name,
            self.TRIGGER,
            extra={
                "ep_id": self.EP_ID,
                "ep_version": self.EP_VERSION,
                "phase": self.PHASE,
                "method": method_name,
                "context": context or {},
            },
        )
