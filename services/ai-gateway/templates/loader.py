from pathlib import Path

from jinja2 import Environment, FileSystemLoader, TemplateNotFound
from pydantic import BaseModel

_PROMPTS_DIR = Path(__file__).resolve().parents[4] / "ai" / "prompts"


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
