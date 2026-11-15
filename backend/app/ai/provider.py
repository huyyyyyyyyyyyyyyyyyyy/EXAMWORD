from app.config import settings


class DeterministicProvider:
    """Explicit non-AI adapter used by the exam parser."""

    name = "deterministic"

    def available(self) -> bool:
        return True


class OllamaProvider:
    """Configuration-only Ollama stub; no network request is made implicitly."""

    name = "ollama"

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url

    def available(self) -> bool:
        return False


def get_ai_provider() -> DeterministicProvider | OllamaProvider:
    if settings.ai_provider == "ollama":
        return OllamaProvider(settings.ollama_url)
    return DeterministicProvider()
