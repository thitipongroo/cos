"""Unit tests for report token budgeting and prompt-template resolution — Phase 12.

§35.13 ESC-24: reports/token_budget.py sat at 64% and templates/loader.py at 91%. The budget is a
cost control (spec 26 bills AI usage per tenant) and a correctness one — an over-budget context is
silently truncated by the model otherwise — so trim_context's sentence-boundary rule is asserted on
both sides of its 80% threshold.
"""

import os
from pathlib import Path

import pytest

from reports.token_budget import (
    MAX_INPUT_TOKENS,
    MAX_OUTPUT_TOKENS,
    TokenBudget,
)
from templates import loader as loader_module


class TestDefaults:
    def test_matches_the_documented_phase_12_budget(self):
        assert (MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS) == (4000, 1000)

    def test_a_default_budget_uses_them(self):
        b = TokenBudget()
        assert b.max_input_tokens == 4000
        assert b.max_output_tokens == 1000

    def test_the_budget_is_overridable(self):
        b = TokenBudget(max_input_tokens=10, max_output_tokens=5)
        assert (b.max_input_tokens, b.max_output_tokens) == (10, 5)


class TestCountTokens:
    @pytest.mark.parametrize(
        "text,expected",
        [("", 0), ("abc", 0), ("abcd", 1), ("abcdefgh", 2), ("x" * 400, 100)],
    )
    def test_estimates_at_four_characters_per_token(self, text, expected):
        assert TokenBudget().count_tokens(text) == expected

    def test_thai_text_is_counted_by_the_same_estimate(self):
        """~4 chars/token is the documented estimate for mixed Thai/English."""
        assert TokenBudget().count_tokens("งานเสร็จแล้ว") == len("งานเสร็จแล้ว") // 4


class TestWithinBudget:
    def test_input_within_budget(self):
        b = TokenBudget(max_input_tokens=10)
        assert b.within_input_budget("x" * 40) is True  # exactly 10 tokens

    def test_input_over_budget(self):
        b = TokenBudget(max_input_tokens=10)
        assert b.within_input_budget("x" * 44) is False  # 11 tokens

    def test_output_within_budget(self):
        b = TokenBudget(max_output_tokens=10)
        assert b.within_output_budget("x" * 40) is True

    def test_output_over_budget(self):
        b = TokenBudget(max_output_tokens=10)
        assert b.within_output_budget("x" * 44) is False


class TestTrimContext:
    def test_returns_short_context_untouched(self):
        b = TokenBudget(max_input_tokens=10)  # 40 chars
        text = "short context."
        assert b.trim_context(text) is text

    def test_returns_exactly_budgeted_context_untouched(self):
        b = TokenBudget(max_input_tokens=10)
        text = "x" * 40
        assert b.trim_context(text) == text

    def test_cuts_at_the_last_sentence_boundary_past_80_percent(self):
        """A period late in the window wins — the caller gets whole sentences."""
        b = TokenBudget(max_input_tokens=10)  # 40 chars
        # period at index 35 (> 0.8 * 40 = 32), so the cut lands just after it
        text = "a" * 35 + "." + "b" * 20
        assert b.trim_context(text) == "a" * 35 + "."

    def test_falls_back_to_a_hard_cut_when_the_only_period_is_early(self):
        """A period before 80% would throw away most of the budget, so it is ignored."""
        b = TokenBudget(max_input_tokens=10)  # 40 chars
        text = "a" * 5 + "." + "b" * 60
        assert b.trim_context(text) == text[:40]

    def test_falls_back_to_a_hard_cut_when_there_is_no_period_at_all(self):
        b = TokenBudget(max_input_tokens=10)
        text = "x" * 100
        assert b.trim_context(text) == "x" * 40

    def test_a_trimmed_context_is_within_budget(self):
        b = TokenBudget(max_input_tokens=10)
        trimmed = b.trim_context("word " * 200)
        assert b.within_input_budget(trimmed)


class TestResolvePromptsDir:
    def test_prefers_the_env_var(self, monkeypatch, tmp_path):
        monkeypatch.setenv("PROMPTS_DIR", str(tmp_path))
        assert loader_module._resolve_prompts_dir() == Path(str(tmp_path))

    def test_walks_up_to_find_ai_prompts_when_the_env_var_is_unset(self, monkeypatch):
        monkeypatch.delenv("PROMPTS_DIR", raising=False)
        found = loader_module._resolve_prompts_dir()
        assert found.is_dir()
        assert found.name == "prompts"
        assert found.parent.name == "ai"

    def test_raises_a_named_error_when_nothing_is_found(self, monkeypatch, tmp_path):
        """The message must say how to fix it — this failure aborts pytest collection otherwise."""
        monkeypatch.delenv("PROMPTS_DIR", raising=False)
        # point the module at a file whose ancestry contains no ai/prompts directory
        isolated = tmp_path / "deep" / "nested" / "loader.py"
        isolated.parent.mkdir(parents=True)
        isolated.write_text("")
        monkeypatch.setattr(loader_module, "__file__", str(isolated))

        with pytest.raises(FileNotFoundError, match="PROMPTS_DIR"):
            loader_module._resolve_prompts_dir()
