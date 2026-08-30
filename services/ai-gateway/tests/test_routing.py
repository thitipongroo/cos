"""Routing table tests (TDD OQ-40).

The defect these guard: config/routing.yaml defined two tiers and was loaded by nothing, so
model_for_hint() returned a hardcoded "gpt-4o" for every hint and the FAST tier never ran. The file
was present, which is why it read as a completed deliverable.

The first test is the one that would have caught it: it asserts a FAST hint resolves to something
DIFFERENT from a POWERFUL hint. Under the old code both returned "gpt-4o" and it fails.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from providers import routing
from providers.routing import load_routing, model_for_hint


@pytest.fixture(autouse=True)
def _clear_cache():
    load_routing.cache_clear()
    yield
    load_routing.cache_clear()


def test_fast_and_powerful_hints_resolve_to_different_models():
    # The assertion the old implementation could not satisfy: it returned the same constant for both.
    assert model_for_hint("summarization") != model_for_hint("report-generation")


@pytest.mark.parametrize(
    "hint,tier",
    [
        ("report-generation", "POWERFUL"),
        ("risk-analysis", "POWERFUL"),
        ("document-extraction", "POWERFUL"),
        ("summarization", "FAST"),
        ("classification", "FAST"),
        ("autocomplete", "FAST"),
    ],
)
def test_every_specified_hint_lands_in_its_tier(hint, tier):
    # The six hints the phase command names, each in the tier it names.
    assert model_for_hint(hint) == load_routing()["tier_to_model"][tier]


def test_unknown_hint_falls_back_to_the_cheap_tier():
    # defaults.fallback_tier is FAST. Deliberately the cheap tier: a hint nobody has classified is
    # not evidence that the expensive model is needed — and the old behaviour did the opposite.
    r = load_routing()
    assert r["fallback_tier"] == "FAST"
    assert model_for_hint("no-such-hint-exists") == r["tier_to_model"]["FAST"]


def test_env_override_wins_over_the_yaml_default(monkeypatch):
    monkeypatch.setenv("OPENAI_FAST_MODEL", "some-other-cheap-model")
    load_routing.cache_clear()
    assert model_for_hint("summarization") == "some-other-cheap-model"


def test_no_model_name_is_hardcoded_in_python():
    # The phase command: "store in env/YAML, never hardcode model names". Guarding the rule itself,
    # because the previous violation was a single constant that looked harmless.
    #
    # Parsed with ast rather than grepped: prose that DESCRIBES the old defect (this file, and the
    # module docstring in routing.py) must not count as a violation, and a substring scan cannot tell
    # a docstring from a value.
    import ast

    src_dir = Path(routing.__file__).resolve().parent
    offenders: list[str] = []

    for path in src_dir.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))

        docstrings = set()
        for node in ast.walk(tree):
            if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                body = getattr(node, "body", None)
                if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
                    docstrings.add(id(body[0].value))

        for node in ast.walk(tree):
            if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
                continue
            if id(node) in docstrings:
                continue
            if "gpt-" in node.value.lower():
                offenders.append(f"{path.name}:{node.lineno} -> {node.value!r}")

    assert offenders == [], f"model name hardcoded as a value in source: {offenders}"


def test_missing_config_raises_rather_than_guessing(monkeypatch, tmp_path):
    # A gateway that silently routes to a guessed model is exactly how OQ-40 survived. A missing
    # routing table is a deployment fault and must read as one.
    monkeypatch.setattr(routing, "ROUTING_CONFIG", tmp_path / "absent.yaml")
    load_routing.cache_clear()
    with pytest.raises(FileNotFoundError):
        load_routing()


def test_a_hint_in_two_tiers_is_rejected(monkeypatch, tmp_path):
    # Ambiguous routing must fail loudly at load, not resolve to whichever tier parsed last.
    bad = tmp_path / "routing.yaml"
    bad.write_text(
        "tiers:\n"
        "  A:\n"
        "    model: 'model-a'\n"
        "    model_hints: [shared]\n"
        "  B:\n"
        "    model: 'model-b'\n"
        "    model_hints: [shared]\n"
        "defaults:\n"
        "  fallback_tier: A\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(routing, "ROUTING_CONFIG", bad)
    load_routing.cache_clear()
    with pytest.raises(ValueError, match="more than one tier"):
        load_routing()


def test_fallback_tier_must_exist(monkeypatch, tmp_path):
    bad = tmp_path / "routing.yaml"
    bad.write_text(
        "tiers:\n  A:\n    model: 'model-a'\n    model_hints: [x]\ndefaults:\n  fallback_tier: NOPE\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(routing, "ROUTING_CONFIG", bad)
    load_routing.cache_clear()
    with pytest.raises(ValueError, match="fallback_tier"):
        load_routing()


def test_unset_variable_without_default_stays_literal(monkeypatch, tmp_path):
    # Not an empty string: an empty model name reaches the provider and fails with an opaque 400,
    # while the literal ${VAR} names the misconfiguration in the error and in ai_usage_logs.
    monkeypatch.delenv("SOME_UNSET_MODEL_VAR", raising=False)
    cfg = tmp_path / "routing.yaml"
    cfg.write_text(
        "tiers:\n"
        "  A:\n"
        "    model: '${SOME_UNSET_MODEL_VAR}'\n"
        "    model_hints: [x]\n"
        "defaults:\n"
        "  fallback_tier: A\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(routing, "ROUTING_CONFIG", cfg)
    load_routing.cache_clear()
    assert model_for_hint("x") == "${SOME_UNSET_MODEL_VAR}"


def test_env_var_names_are_documented_in_env_example():
    # The command's rule is "store in env/YAML". A variable an operator cannot discover is not
    # configuration, so both names must appear in .env.example.
    root = Path(routing.__file__).resolve().parents[3]
    env_example = (root / ".env.example").read_text(encoding="utf-8")
    assert "OPENAI_POWERFUL_MODEL" in env_example
    assert "OPENAI_FAST_MODEL" in env_example
