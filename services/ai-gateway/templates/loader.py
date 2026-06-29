import os
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, TemplateNotFound
from pydantic import BaseModel


def _resolve_prompts_dir() -> Path:
    """Locate the ai/prompts directory.

    In containers the service code is flattened to /app, so the old fixed-depth
    `parents[4]` walk does not apply (and was off-by-one for the monorepo too).
    Prefer the PROMPTS_DIR env var; otherwise walk up to find an `ai/prompts` dir
    (works from services/ai-gateway/templates/loader.py on host and in tests).
    """
    env = os.environ.get("PROMPTS_DIR")
    if env:
        return Path(env)
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "ai" / "prompts"
        if candidate.is_dir():
            return candidate
    raise FileNotFoundError("Could not locate ai/prompts; set the PROMPTS_DIR env var")


_PROMPTS_DIR = _resolve_prompts_dir()


def _get_env() -> Environment:
    return Environment(loader=FileSystemLoader(str(_PROMPTS_DIR)), autoescape=False)


def render_template(template_name: str, variables: BaseModel) -> str:
    """Load a Jinja2 prompt template and render it with typed variables.

    Template files: ai/prompts/{phase}-{use-case}-v{version}.j2
    Variables must be a Pydantic model — never raw dicts.
    Source: context/00_master_construction_os.md §Phase 11 Prompt Template Management.
    """
    env = _get_env()
    try:
        tmpl = env.get_template(f"{template_name}.j2")
    except TemplateNotFound:
        raise FileNotFoundError(f"Prompt template not found: ai/prompts/{template_name}.j2")

    return tmpl.render(**variables.model_dump())
