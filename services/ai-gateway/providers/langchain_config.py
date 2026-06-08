from abc import ABC, abstractmethod
from typing import Any


class LangChainProviderConfig(ABC):
    @abstractmethod
    def get_provider_package(self) -> str: ...

    @abstractmethod
    def get_model_class(self) -> type: ...

    @abstractmethod
    def build_chain(self, chain_type: str, tenant_id: str) -> Any: ...


class StubLangChainProviderConfig(LangChainProviderConfig):
    def get_provider_package(self) -> str:
        raise NotImplementedError("StubLangChainProviderConfig: configure langchain-openai before use")

    def get_model_class(self) -> type:
        raise NotImplementedError("StubLangChainProviderConfig: configure langchain-openai before use")

    def build_chain(self, chain_type: str, tenant_id: str) -> Any:
        raise NotImplementedError("StubLangChainProviderConfig: configure langchain-openai before use")
