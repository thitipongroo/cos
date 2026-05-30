# AI Prompt Templates

All LLM prompts are stored as Jinja2 `.j2` files in this directory.

Naming convention: `{phase}-{use-case}-v{version}.j2`
Example: `report-daily-summary-v1.j2`

No hardcoded prompts in source code — all via template files (Phase 11 spec).
Template variables are always typed via Pydantic models.
