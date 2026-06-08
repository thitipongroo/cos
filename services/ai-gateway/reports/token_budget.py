_CHARS_PER_TOKEN = 4  # ~4 chars/token for mixed Thai/English (conservative estimate)

MAX_INPUT_TOKENS = 4000
MAX_OUTPUT_TOKENS = 1000


class TokenBudget:
    """Enforces token budget for report generation pipeline.

    Input: max 4000 tokens context window
    Output: max 1000 tokens generated response
    Source: context/00_master_construction_os.md §Phase 12 Generate
    """

    def __init__(
        self,
        max_input_tokens: int = MAX_INPUT_TOKENS,
        max_output_tokens: int = MAX_OUTPUT_TOKENS,
    ) -> None:
        self.max_input_tokens = max_input_tokens
        self.max_output_tokens = max_output_tokens

    def count_tokens(self, text: str) -> int:
        return len(text) // _CHARS_PER_TOKEN

    def within_input_budget(self, text: str) -> bool:
        return self.count_tokens(text) <= self.max_input_tokens

    def within_output_budget(self, text: str) -> bool:
        return self.count_tokens(text) <= self.max_output_tokens

    def trim_context(self, context: str) -> str:
        """Trim context to fit within input token budget.

        Cuts at the last sentence boundary within budget to avoid
        mid-sentence truncation.
        """
        max_chars = self.max_input_tokens * _CHARS_PER_TOKEN
        if len(context) <= max_chars:
            return context

        trimmed = context[:max_chars]
        last_period = trimmed.rfind(".")
        if last_period > int(max_chars * 0.8):
            return trimmed[: last_period + 1]
        return trimmed
